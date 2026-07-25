import html
import json
import re
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.export import to_html, to_json
from graphify.report import generate

ROOT = Path(".").resolve()
OUT = ROOT / "graphify-out"


def norm(value):
    value = re.sub(r"[^a-zA-Z0-9_]+", "_", value.lower())
    return re.sub(r"_+", "_", value).strip("_")


class HeadingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = None
        self.buffer = []
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"title", "h1", "h2", "h3"}:
            self.active = tag.lower()
            self.buffer = []

    def handle_data(self, data):
        if self.active:
            self.buffer.append(data)

    def handle_endtag(self, tag):
        if self.active and tag.lower() == self.active:
            value = re.sub(r"\s+", " ", html.unescape(" ".join(self.buffer))).strip()
            if value:
                self.items.append(value)
            self.active = None
            self.buffer = []


def headings(relative_path):
    path = ROOT / relative_path
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    ext = path.suffix.lower()
    items = []
    if ext in {".md", ".markdown", ".txt"}:
        for line_number, line in enumerate(text.splitlines(), 1):
            match = re.match(r"^\s*(#{1,6})\s+(.+?)\s*$", line)
            if match:
                items.append((line_number, match.group(2)))
    elif ext in {".html", ".htm"}:
        parser = HeadingParser()
        parser.feed(text)
        items = [(None, value) for value in parser.items]
    elif ext in {".yaml", ".yml"}:
        for line_number, line in enumerate(text.splitlines(), 1):
            match = re.match(r"^([A-Za-z_][\w-]*):", line)
            if match:
                items.append((line_number, "Configuration: " + match.group(1)))
    result = []
    seen = set()
    for location, label in items:
        label = re.sub(r"[`*_]", "", label).strip()
        key = label.casefold()
        if len(label) < 3 or key in seen:
            continue
        seen.add(key)
        result.append((location, label))
        if len(result) >= 50:
            break
    return result


detect = json.loads((OUT / ".graphify_detect.json").read_text())
ast = json.loads((OUT / ".graphify_ast.json").read_text())
inventory = json.loads((OUT / ".graphify_inventory.json").read_text())

base_nodes = ast.get("nodes", []) + inventory.get("nodes", [])
base_edges = ast.get("edges", []) + inventory.get("edges", [])
seen = set()
nodes = []
for node in base_nodes:
    if node.get("id") not in seen:
        seen.add(node.get("id"))
        nodes.append(node)

document_nodes = []
document_edges = []
for absolute_path in detect.get("files", {}).get("document", []):
    path = Path(absolute_path).resolve()
    if not path.exists():
        continue
    relative_path = path.relative_to(ROOT).as_posix()
    file_id = "file_" + norm(relative_path)
    for location, label in headings(relative_path):
        node_id = "doc_" + norm(relative_path) + "_" + norm(label)[:100]
        if node_id in seen:
            node_id += "_heading"
        if node_id in seen:
            continue
        seen.add(node_id)
        document_nodes.append(
            {
                "id": node_id,
                "label": label,
                "file_type": "document",
                "source_file": relative_path,
                "source_location": "L" + str(location) if location else None,
            }
        )
        document_edges.append(
            {
                "source": file_id,
                "target": node_id,
                "relation": "references",
                "confidence": "EXTRACTED",
                "confidence_score": 1.0,
                "source_file": relative_path,
                "source_location": "L" + str(location) if location else None,
                "weight": 1.0,
            }
        )

nodes.extend(document_nodes)
edges = base_edges + document_edges
semantic_nodes = []
semantic_edges = []
semantic_hyperedges = []
semantic_chunk_count = 0
for chunk_path in sorted(OUT.glob(".graphify_chunk_*.json")):
    try:
        fragment = json.loads(chunk_path.read_text())
    except (OSError, json.JSONDecodeError):
        continue
    if not isinstance(fragment.get("nodes"), list) or not isinstance(fragment.get("edges"), list):
        continue
    semantic_chunk_count += 1
    semantic_nodes.extend(fragment.get("nodes", []))
    semantic_edges.extend(fragment.get("edges", []))
    semantic_hyperedges.extend(fragment.get("hyperedges", []))
nodes.extend(semantic_nodes)
edges.extend(semantic_edges)
for edge in edges:
    edge.setdefault("confidence_score", 1.0)

extraction = {
    "nodes": nodes,
    "edges": edges,
    "hyperedges": semantic_hyperedges,
    "input_tokens": 0,
    "output_tokens": 0,
}
(OUT / ".graphify_extract.json").write_text(json.dumps(extraction, indent=2))

graph = build_from_json(extraction, directed=False, root=ROOT)
if graph.number_of_nodes() == 0:
    raise SystemExit("ERROR: graph is empty")
communities = cluster(graph)
cohesion = score_all(graph, communities)
gods = god_nodes(graph)
surprises = surprising_connections(graph, communities)
temporary_labels = {cid: "Community " + str(cid) for cid in communities}
questions = suggest_questions(graph, communities, temporary_labels)

label_map = {
    "SIDA": "SIDA Project",
    "my-react-flow-app": "React Flow Frontend",
    "server": "Backend Service",
    "Image-to-Descriptor": "Image Descriptors",
    "tests": "Test Suite",
    "outputs": "Sample Outputs",
    ".vscode": "Developer Config",
}


def community_label(members):
    roots = Counter()
    second = Counter()
    for node_id in members:
        source_file = graph.nodes[node_id].get("source_file") or ""
        parts = Path(source_file).parts
        if not parts or source_file in {"", "."}:
            continue
        roots[parts[0]] += 1
        if len(parts) > 1:
            second[(parts[0], parts[1])] += 1
    top = roots.most_common(1)[0][0] if roots else "project"
    if top == "SIDA" and second:
        subfolder = second.most_common(1)[0][0][1]
        if subfolder in {"src", "scripts"}:
            return "SIDA Source Pipeline"
        if subfolder == "docs":
            return "SIDA Documentation"
        if subfolder == "data":
            return "SIDA Dataset Assets"
        if subfolder == "outputs":
            return "SIDA Experiment Outputs"
    return label_map.get(top, "Project Structure")


labels = {}
used_labels = Counter()
for community_id, members in communities.items():
    base = community_label(members)
    used_labels[base] += 1
    labels[community_id] = base if used_labels[base] == 1 else base + " " + str(used_labels[base])

try:
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, cwd=ROOT).strip()
except Exception:
    commit = None

report = generate(
    graph,
    communities,
    cohesion,
    labels,
    gods,
    surprises,
    detect,
    {"input": 0, "output": 0},
    ".",
    suggested_questions=questions,
    built_at_commit=commit,
)
report += "\n\n## Coverage & Audit\n\n"
report += f"- Current detection: **{detect.get('total_files')} files** ({sum(len(values) for values in detect.get('files', {}).values())} paths present at build time).\n"
report += f"- Inventory coverage: **{inventory.get('inventory_files')} files** represented by file nodes; generated images and label/result artifacts are included by path and directory relationships.\n"
report += f"- Structural code extraction: **{len(ast.get('nodes', []))} nodes / {len(ast.get('edges', []))} edges** across {len(detect.get('files', {}).get('code', []))} code files.\n"
report += f"- Document structure extraction: **{len(document_nodes)} heading/configuration nodes** from {len(detect.get('files', {}).get('document', []))} document files.\n"
report += f"- Semantic LLM fragments: **{len(semantic_nodes)} nodes / {len(semantic_edges)} edges from {semantic_chunk_count} valid chunk(s)**.\n"
report += "- Image-vision pass: **not completed**; image files remain fully inventoried by path and directory but are not visually interpreted.\n"
report += "- This audit distinguishes structural coverage from semantic interpretation; rerun with an authenticated LLM backend to enrich remaining document/image concepts without changing the inventory.\n"
(OUT / "GRAPH_REPORT.md").write_text(report)
to_json(graph, communities, str(OUT / "graph.json"), force=True, built_at_commit=commit)
to_html(graph, communities, str(OUT / "graph.html"), community_labels=labels, node_limit=10000)
(OUT / ".graphify_analysis.json").write_text(
    json.dumps(
        {
            "communities": {str(k): v for k, v in communities.items()},
            "cohesion": {str(k): v for k, v in cohesion.items()},
            "gods": gods,
            "surprises": surprises,
            "questions": questions,
            "labels": {str(k): v for k, v in labels.items()},
        },
        indent=2,
    )
)
(OUT / ".graphify_labels.json").write_text(json.dumps({str(k): v for k, v in labels.items()}, indent=2))
print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges, {len(communities)} communities")
print(f"Document headings: {len(document_nodes)}")
print(f"HTML bytes: {(OUT / 'graph.html').stat().st_size}")
