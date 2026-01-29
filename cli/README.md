# @desci-labs/nodes-cli

A CLI for interacting with DeSci Nodes - push, pull, and publish research data to decentralized nodes.

```
  ███╗   ██╗ ██████╗ ██████╗ ███████╗███████╗
  ████╗  ██║██╔═══██╗██╔══██╗██╔════╝██╔════╝
  ██╔██╗ ██║██║   ██║██║  ██║█████╗  ███████╗
  ██║╚██╗██║██║   ██║██║  ██║██╔══╝  ╚════██║
  ██║ ╚████║╚██████╔╝██████╔╝███████╗███████║
  ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
```

## Installation

```bash
# From the nodes monorepo
cd nodes/cli
pnpm install
pnpm build
npm link

# Or run directly
pnpm dev
```

## Quick Start

```bash
# 1. Initialize with your API key
nodes-cli init

# 2. Push a folder to a new node
nodes-cli push ./my-research --new --title "My Research Project"

# 3. List your nodes
nodes-cli list

# 4. Pull files from a node
nodes-cli pull <node-uuid> -o ./downloaded

# 5. Publish a node with a dPID
nodes-cli publish <node-uuid>
```

---

## Commands

### `nodes-cli init`

Interactive setup wizard to configure your API key and environment.

```bash
nodes-cli init
```

This will prompt you to:
1. Select an environment (dev, staging, prod, local)
2. Enter your API key (masked with `*` characters)
3. Optionally set up a private key for publishing

---

### `nodes-cli push`

Push a folder or files to a DeSci node.

```bash
nodes-cli push [path] [options]
```

**Arguments:**
| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Path to folder or file(s) to upload | `.` |

**Options:**
| Flag | Description |
|------|-------------|
| `-n, --node <uuid>` | Target node UUID |
| `-t, --target <path>` | Target path in node drive | `root` |
| `--new` | Create a new node |
| `--title <title>` | Title for new node |
| `--clean` | Remove remote files not in local |
| `--dry-run` | Preview changes |
| `--prepublish` | Prepare for publishing after upload |
| `-v, --verbose` | Detailed output |

**Examples:**

```bash
# Push to a new node
nodes-cli push ./data --new --title "My Dataset"

# Update existing node
nodes-cli push ./data --node abc123

# Push and prepare for publish
nodes-cli push ./data --node abc123 --prepublish
```

---

### `nodes-cli pull`

Download files from a DeSci node.

```bash
nodes-cli pull [node] [options]
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output directory | `.` |
| `-p, --path <path>` | Path within node to pull | `root` |

**Examples:**

```bash
# Interactive selection
nodes-cli pull

# Pull to specific directory
nodes-cli pull abc123 -o ./downloads
```

---

### `nodes-cli list` (alias: `ls`)

List your nodes or files within a node.

```bash
nodes-cli list [node] [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `-a, --all` | Show all details |
| `-t, --tree` | Show file tree |

---

### `nodes-cli publish`

Publish a node to Codex with a dPID. **Requires a private key for signing.**

```bash
nodes-cli publish [node] [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `-k, --private-key` | Prompt for private key (won't be saved) |
| `--save-key` | Save the private key for future use |
| `--mint-doi` | Request DOI minting |

**Examples:**

```bash
# Publish a node (uses saved key or prompts)
nodes-cli publish abc123

# Publish with one-time key (won't be saved)
nodes-cli publish abc123 -k

# Publish and save key for future
nodes-cli publish abc123 --save-key
```

**What happens during publish:**
1. Prepares the node manifest
2. Signs the transaction with your private key
3. Writes to Ceramic/Codex
4. Registers a dPID alias
5. Updates the node's publication status

---

### `nodes-cli config`

Manage CLI configuration.

```bash
nodes-cli config [options]
nodes-cli config login
nodes-cli config logout
nodes-cli config set-key
nodes-cli config clear-key
```

**Options:**
| Flag | Description |
|------|-------------|
| `-k, --api-key <key>` | Set API key |
| `-e, --env <env>` | Set environment |
| `--show` | Show current config |
| `--clear` | Clear all config |

**Subcommands:**
| Command | Description |
|---------|-------------|
| `login` | Interactive login |
| `logout` | Clear credentials |
| `set-key` | Set private key |
| `clear-key` | Remove private key |

---

### `nodes-cli status`

Show CLI status and test connection.

```bash
nodes-cli status
```

---

### `nodes-cli open`

Open a node in your web browser.

```bash
nodes-cli open <node>
```

---

## Configuration

Configuration is stored at:
- **macOS:** `~/Library/Preferences/desci-nodes-cli-nodejs/config.json`
- **Linux:** `~/.config/desci-nodes-cli-nodejs/config.json`
- **Windows:** `%APPDATA%\desci-nodes-cli-nodejs\Config\config.json`

### Environments

| Environment | API URL | Web URL |
|-------------|---------|---------|
| `local` | `http://localhost:5420` | `http://localhost:3000` |
| `dev` | `https://nodes-api-dev.desci.com` | `https://nodes-dev.desci.com` |
| `staging` | `https://nodes-api-staging.desci.com` | `https://nodes-staging.desci.com` |
| `prod` | `https://nodes-api.desci.com` | `https://nodes.desci.com` |

---

## Publishing Workflow

1. **Create and upload content:**
   ```bash
   nodes-cli push ./research --new --title "My Research"
   ```

2. **Review the node in browser:**
   ```bash
   nodes-cli open abc123
   ```

3. **Publish with dPID:**
   ```bash
   nodes-cli publish abc123
   ```

4. **Update and republish:**
   ```bash
   nodes-cli push ./updated --node abc123
   nodes-cli publish abc123
   ```

---

## Security Notes

- **API Key**: Masked with `*` characters during input
- **Private Key**: Masked with `*` characters during input
- **Storage**: Both keys are stored in a local config file
- Use `config clear-key` to remove the private key
- Use `publish -k` for one-time key entry without saving

---

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in development mode
pnpm dev --help

# Link globally for testing
npm link
```

---

## License

MIT

