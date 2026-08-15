const DEFAULT_FORMAT = "gfm";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  bun run scripts/rst-to-markdown.ts [options] [file.rst]",
      "",
      "Convert reStructuredText to Markdown via pandoc.",
      "",
      "Reads from <file> or stdin, writes to stdout.",
      "",
      "Options:",
      "  -f, --format <fmt>   Output markdown flavor (default: gfm).",
      "                       Common: gfm, markdown, commonmark, markdown_strict.",
      "  -o, --output <file>  Write output to <file> instead of stdout.",
      "  -h, --help           Show this help.",
      "",
      "Examples:",
      "  bun run scripts/rst-to-markdown.ts README.rst > README.md",
      "  cat README.rst | bun run scripts/rst-to-markdown.ts -f commonmark",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(args: string[]): { format: string; output?: string; input?: string } {
  const opts = { format: DEFAULT_FORMAT, output: undefined as string | undefined, input: undefined as string | undefined };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        usage();
        break;
      case "-f":
      case "--format":
        opts.format = args[++i];
        if (!opts.format) usage();
        break;
      case "-o":
      case "--output":
        opts.output = args[++i];
        if (!opts.output) usage();
        break;
      default:
        if (arg.startsWith("-") || opts.input !== undefined) usage();
        opts.input = arg;
    }
  }

  return opts;
}

async function convert(rst: string, format: string): Promise<string> {
  const proc = Bun.spawn(
    ["pandoc", "--from=rst", `--to=${format}`, "--wrap=none"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );

  proc.stdin.write(rst);
  await proc.stdin.end();

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if ((await proc.exited) !== 0) {
    throw new Error(`pandoc failed: ${stderr.trim()}`);
  }

  return stdout;
}

async function main() {
  const { format, output, input } = parseArgs(process.argv.slice(2));

  const rst = input
    ? await Bun.file(input).text()
    : await new Response(Bun.stdin.stream()).text();

  const md = await convert(rst, format);

  if (output) {
    await Bun.write(output, md);
    console.error(`Wrote ${output}`);
  } else {
    process.stdout.write(md);
  }
}

main().catch((err) => {
  console.error("rst-to-markdown failed:", err.message ?? err);
  process.exit(1);
});
