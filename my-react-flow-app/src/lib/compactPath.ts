// Display only: never pass this abbreviated value to an API or save it as a parameter.
export function compactPath(path: string, maxLength = 44): string {
  const projectStart = path.indexOf('/VIPER/');
  const display = projectStart >= 0
    ? path.slice(projectStart + 1)
    : path.replace(/^\/Users\/[^/]+(?=\/)/, '~').replace(/^\/home\/[^/]+(?=\/)/, '~');
  if (display.length <= maxLength) return display;
  const parts = display.split('/');
  if (parts.length > 4) {
    const shortened = `${parts.slice(0, display.startsWith('VIPER/') ? 1 : 2).join('/')}/…/${parts.slice(-2).join('/')}`;
    if (shortened.length <= maxLength) return shortened;
  }
  const headLength = Math.floor((maxLength - 1) / 3);
  return `${display.slice(0, headLength)}…${display.slice(-(maxLength - headLength - 1))}`;
}
