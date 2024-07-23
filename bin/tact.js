#!/usr/bin/env node

const pkg = require("../package.json");
const main = require("../dist/node.js");
const { execFileSync } = require("child_process");

async function initializeCli() {
    const meow = await import("meow");
    const cli = meow.default(
        `
Usage
  $ tact [...flags] (--config CONFIG | FILE)

Flags
  -c, --config CONFIG         Specify path to config file (tact.config.json)
  -p, --project ...names      Build only the specified project name(s) from the config file
  -q, --quiet                 Suppress compiler log output
  --with-decompilation        Full compilation followed by decompilation of produced binary code
  --func                      Output intermediate FunC code and exit
  --check                     Perform syntax and type checking, then exit
  -e, --eval EXPRESSION       Evaluate a Tact expression and exit
  -v, --version               Print Tact compiler version and exit
  -h, --help                  Display this text and exit

Examples
  $ tact --version
  ${pkg.version}

Learn more about Tact:        https://docs.tact-lang.org
Join Telegram group:          https://t.me/tactlang
Follow X/Twitter account:     https://twitter.com/tact_language`,
        {
            importMeta: {
                url: new URL("file://" + __dirname + __filename).toString(),
            },
            description: `Command-line utility for the Tact compiler:\n${pkg.description}`,
            autoVersion: false,
            flags: {
                config: {
                    shortFlag: "c",
                    type: "string",
                    isRequired: (flags) => {
                        return (
                            flags.projects.length !== 0 &&
                            !flags.version &&
                            !flags.help &&
                            !flags.eval
                        );
                    },
                },
                projects: {
                    shortFlag: "p",
                    type: "string",
                    isMultiple: true,
                },
                quiet: { shortFlag: "q", type: "boolean", default: false },
                withDecompilation: { type: "boolean", default: false },
                func: { type: "boolean", default: false },
                check: { type: "boolean", default: false },
                eval: { shortFlag: "e", type: "string" },
                version: { shortFlag: "v", type: "boolean" },
                help: { shortFlag: "h", type: "boolean" },
            },
            allowUnknownFlags: false,
        }
    );

    return cli;
}

function isEmptyConfigAndInput(cli) {
    return cli.flags.config === undefined && cli.input.length === 0;
}

function showErrorAndExit(message, cli) {
    console.error(`Error: ${message}`);
    cli.showHelp();
}

async function run() {
    const cli = await initializeCli();

    if (cli.flags.help) {
        cli.showHelp(0);
    }

    if (cli.flags.version) {
        console.log(pkg.version);
        try {
            const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            console.log(`git commit: ${gitCommit}`);
        } finally {
            process.exit(0);
        }
    }

    if (cli.flags.eval) {
        try {
            const result = main.parseAndEvalExpression(cli.flags.eval);
            if (result.kind === "ok") {
                console.log(result.value);
            } else {
                console.error(result.message);
                process.exit(30);
            }
        } catch (error) {
            console.error("Evaluation error:", error);
            process.exit(1);
        }
    }

    if (cli.flags.config !== undefined && cli.input.length > 0) {
        showErrorAndExit("Both config and Tact file can't be simultaneously specified, pick one!", cli);
    }

    const compilationModeFlags = [
        cli.flags.check,
        cli.flags.func,
        cli.flags.withDecompilation,
    ];
    const numOfCompilationModeFlagsSet = compilationModeFlags.filter(flag => flag).length;
    if (numOfCompilationModeFlagsSet > 1) {
        showErrorAndExit("Flags --with-decompilation, --func and --check are mutually exclusive!", cli);
    }

    if (isEmptyConfigAndInput(cli) && numOfCompilationModeFlagsSet > 0) {
        showErrorAndExit("Either config or Tact file have to be specified!", cli);
    }

    if (cli.input.length > 1) {
        showErrorAndExit("Only one Tact file can be specified at a time. If you want more, provide a config!", cli);
    }

    if (isEmptyConfigAndInput(cli) && numOfCompilationModeFlagsSet === 0 && cli.flags.projects.length === 0) {
        cli.showHelp(0);
    }

    const mode = cli.flags.check
        ? "checkOnly"
        : cli.flags.func
        ? "funcOnly"
        : cli.flags.withDecompilation
        ? "fullWithDecompilation"
        : undefined;

    try {
        const response = await main.run({
            fileName: cli.input.at(0),
            configPath: cli.flags.config,
            projectNames: cli.flags.projects ?? [],
            additionalCliOptions: { mode },
            suppressLog: cli.flags.quiet,
        });
        process.exit(response.ok ? 0 : 30);
    } catch (error) {
        console.error("Execution error:", error);
        process.exit(1);
    }
}

run();
