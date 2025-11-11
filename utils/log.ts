type LogLevel = 'log' | 'warn' | 'error';

function write(level: LogLevel, label: string, ...args: unknown[]) {
  const tag = label ? `[${label}]` : '';
  if (level === 'log') {
    console.log(tag, ...args);
  } else if (level === 'warn') {
    console.warn(tag, ...args);
  } else {
    console.error(tag, ...args);
  }
}

export function log(label: string, ...args: unknown[]) {
  write('log', label, ...args);
}

export function warn(label: string, ...args: unknown[]) {
  write('warn', label, ...args);
}

export function error(label: string, ...args: unknown[]) {
  write('error', label, ...args);
}

