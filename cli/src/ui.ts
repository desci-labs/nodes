import chalk from "chalk";
import boxen from "boxen";
import gradient from "gradient-string";
import figures from "figures";
import ora, { type Ora } from "ora";

// Custom gradient for DeSci branding
const desciGradient = gradient(["#6366f1", "#8b5cf6", "#a855f7"]);
const successGradient = gradient(["#10b981", "#34d399"]);
const errorGradient = gradient(["#ef4444", "#f87171"]);

export const symbols = {
  success: chalk.green(figures.tick),
  error: chalk.red(figures.cross),
  warning: chalk.yellow(figures.warning),
  info: chalk.blue(figures.info),
  pointer: chalk.cyan(figures.pointer),
  arrowRight: chalk.dim(figures.arrowRight),
  bullet: chalk.dim(figures.bullet),
  node: "🔬",
  folder: "📁",
  file: "📄",
  upload: "⬆️ ",
  download: "⬇️ ",
  key: "🔑",
  check: "✓",
  cross: "✗",
  star: "⭐",
  publish: "🚀",
};

export function printBanner(): void {
  const banner = `
  ███╗   ██╗ ██████╗ ██████╗ ███████╗███████╗
  ████╗  ██║██╔═══██╗██╔══██╗██╔════╝██╔════╝
  ██╔██╗ ██║██║   ██║██║  ██║█████╗  ███████╗
  ██║╚██╗██║██║   ██║██║  ██║██╔══╝  ╚════██║
  ██║ ╚████║╚██████╔╝██████╔╝███████╗███████║
  ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
`;
  console.log(desciGradient.multiline(banner));
  console.log(
    chalk.dim("  Push, pull & publish research data to decentralized nodes\n"),
  );
}

export function printSuccess(message: string): void {
  console.log(`\n${symbols.success} ${successGradient(message)}\n`);
}

export function printError(message: string): void {
  console.log(`\n${symbols.error} ${errorGradient(message)}\n`);
}

export function printWarning(message: string): void {
  console.log(`\n${symbols.warning} ${chalk.yellow(message)}\n`);
}

export function printInfo(message: string): void {
  console.log(`${symbols.info} ${chalk.blue(message)}`);
}

export function printBox(title: string, content: string): void {
  console.log(
    boxen(content, {
      title,
      titleAlignment: "center",
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );
}

export function printNodeInfo(node: {
  uuid: string;
  title: string;
  isPublished?: boolean;
  cid?: string;
  dpidAlias?: number;
}): void {
  const status = node.isPublished
    ? chalk.green("● Published")
    : chalk.yellow("○ Draft");

  console.log(
    boxen(
      [
        `${chalk.bold("Title:")} ${node.title}`,
        `${chalk.bold("UUID:")}  ${chalk.dim(node.uuid)}`,
        node.cid ? `${chalk.bold("CID:")}   ${chalk.dim(node.cid)}` : "",
        node.dpidAlias ? `${chalk.bold("dPID:")}  ${chalk.cyan(node.dpidAlias)}` : "",
        `${chalk.bold("Status:")} ${status}`,
      ]
        .filter(Boolean)
        .join("\n"),
      {
        title: `${symbols.node} Node`,
        titleAlignment: "left",
        padding: 1,
        margin: { top: 1, bottom: 1, left: 0, right: 0 },
        borderStyle: "round",
        borderColor: node.isPublished ? "green" : "yellow",
      },
    ),
  );
}

export function printFileList(
  files: string[],
  type: "upload" | "download",
): void {
  const icon = type === "upload" ? symbols.upload : symbols.download;
  const action = type === "upload" ? "to upload" : "downloaded";

  console.log(`\n${icon} Files ${action}:\n`);
  files.slice(0, 10).forEach((file) => {
    console.log(`  ${symbols.arrowRight} ${chalk.dim(file)}`);
  });
  if (files.length > 10) {
    console.log(chalk.dim(`  ... and ${files.length - 10} more files`));
  }
  console.log();
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: "dots12",
    color: "cyan",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function printTable(
  headers: string[],
  rows: string[][],
  options?: { maxWidth?: number },
): void {
  const maxWidth = options?.maxWidth || 80;
  const colWidths = headers.map((h, i) =>
    Math.min(
      Math.max(h.length, ...rows.map((r) => (r[i] || "").length)),
      Math.floor(maxWidth / headers.length),
    ),
  );

  const headerRow = headers
    .map((h, i) => chalk.bold(h.padEnd(colWidths[i])))
    .join("  ");
  const separator = colWidths.map((w) => chalk.dim("─".repeat(w))).join("──");

  console.log(`\n  ${headerRow}`);
  console.log(`  ${separator}`);

  rows.forEach((row) => {
    const formattedRow = row
      .map((cell, i) => {
        const truncated =
          cell.length > colWidths[i]
            ? cell.slice(0, colWidths[i] - 1) + "…"
            : cell;
        return truncated.padEnd(colWidths[i]);
      })
      .join("  ");
    console.log(`  ${formattedRow}`);
  });
  console.log();
}

export function truncateUuid(uuid: string, length = 8): string {
  if (uuid.length <= length) return uuid;
  return uuid.slice(0, length) + "...";
}

export function maskString(str: string, visibleEnd = 4): string {
  if (str.length <= visibleEnd) return "*".repeat(str.length);
  return "*".repeat(str.length - visibleEnd) + str.slice(-visibleEnd);
}

