export function formatTemperature(value: number): string {
  return `${value.toFixed(1)}°C`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}
