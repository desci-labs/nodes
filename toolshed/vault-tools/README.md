# vault-tools

Misc scripts for working with Vault. Requires the `vault` binary to be available in your PATH.

## `secretSearch.sh`

Search all secrets for a given string, 

```bash
Usage: ./secretSearch.sh -s <secret-value> [-m <mount-path>] [-t <vault-token>] [-a <vault-addr>]

Options:
  -s  Secret value to search for
  -m  Mount path to start search from (default: search all mounts)
  -t  Vault token (defaults to VAULT_TOKEN env variable)
  -a  Vault address (defaults to VAULT_ADDR env variable)
  -h  Show this help message
```
