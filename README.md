# VIPER — Visual Image Processing Pipeline Engine & Routing
**Senior Project | Computer Engineering, Chitralada Technology Institute**

Project VIPER is an end-to-end node-based image processing platform designed to transform complex, multi-stage backend processing workflows into intuitive, visual drag-and-drop pipelines. Built explicitly to replace traditional linear script execution, it allows operators to construct, evaluate, and monitor visual data routing through an interactive node-based UI — making complex backend pipelines visible and manageable.

---

## 🏗️ System Architecture & Data Flow

The platform separates layers cleanly between a reactive visual interface and a high-performance backend analytics engine. Data structures are parsed into structured JSON schemas, dispatched through a centralized router, and stored transactionally within a relational database.

<img width="864" height="390" alt="Screenshot 2569-02-22 at 00 28 02" src="https://github.com/user-attachments/assets/9b219e41-641e-4b05-94d2-55d908b14cc4" />

---

## 📡 Platform Interface & Live Workflow Evaluation

### 1. Unified Pipeline Canvas (Initial State)
An interactive canvas designed with collapsible operations libraries (`Input`, `Enhancement`, `Segmentation`, `Feature Extraction`, `Matching`, etc.) supporting organized node selections.

<img width="1440" height="813" alt="Screenshot 2569-04-27 at 16 54 22" src="https://github.com/user-attachments/assets/033f0b60-432b-472e-adc4-7e0cedcdc7d0" />

### 2. Live Complex Workflow Execution & System Logging
Operators can build intricate computational graphics. As the tracking triggers, sequential system metrics provide real-time validation logs directly inside the monitoring layout.

<img width="1440" height="815" alt="Screenshot 2569-04-27 at 16 54 07" src="https://github.com/user-attachments/assets/ffa89f71-3b67-40f8-a726-65f13de53075" />

---

## 🚀 Strict Quality Assurance & Test Suite Validation

To guarantee system logic stability during high-throughput image routing and schema translation, the platform integrates a comprehensive automated testing matrix. 

Executing the test suite demonstrates robust coverage across algorithmic edge-cases, data modeling integrity, and system rules, yielding zero execution regressions.

<img width="1514" height="136" alt="Screenshot 2569-02-22 at 19 33 29" src="https://github.com/user-attachments/assets/52d33d32-8619-40b5-9324-9639c2246657" />

---

## ✨ Key Features

- 🔀 **Visual Workflow Editor:** Interactive node-based pipeline builder using **React Flow** and **TypeScript**.
- 🖼️ **Image Processing Engine:** Processes images through configurable pipeline stages with SURF feature detection and BRISQUE quality scoring via **OpenCV**.
- 🗄️ **Relational Data Management:** Architected with a **PostgreSQL** schema to handle all pipeline transactions and enforce absolute data integrity.
- ✅ **Automated Testing:** Comprehensive **Pytest** test suite covering functional edge cases, data constraints, and strict system rules.
- 🐳 **Containerized Infrastructure:** Pre-configured with **Docker** and `docker-compose` for rapid deployment and easy multi-environment setup.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Next.js, React, TypeScript |
| **Visual Library** | React Flow (Canvas) |
| **Backend Engine** | Python, FastAPI |
| **Database Management** | PostgreSQL |
| **Image Processing** | OpenCV (SURF, BRISQUE) |
| **Testing Automation** | Pytest |
| **Infrastructure** | Docker, Docker Compose |

---

## 📁 Project Structure

```text
VIPER/
├── my-react-flow-app/     # Next.js frontend with React Flow editor
├── server/                # FastAPI backend & pipeline logic
├── Image-to-Descriptor/   # OpenCV image processing modules
├── tests/                 # Pytest test suite
├── outputs/samples/       # Sample pipeline outputs
├── Dockerfile
└── docker-compose.yml
