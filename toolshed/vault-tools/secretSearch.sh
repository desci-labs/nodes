#! /bin/env bash

# Usage function
usage() {
    echo "Usage: $0 -s <secret-value> [-m <mount-path>] [-t <vault-token>] [-a <vault-addr>]"
    echo
    echo "Options:"
    echo "  -s  Secret value to search for"
    echo "  -m  Mount path to start search from (default: search all mounts)"
    echo "  -t  Vault token (defaults to VAULT_TOKEN env variable)"
    echo "  -a  Vault address (defaults to VAULT_ADDR env variable)"
    echo "  -h  Show this help message"
    exit 1
}

# Parse command line arguments
while getopts "s:m:t:a:h" opt; do
    case $opt in
        s) SECRET_VALUE="$OPTARG" ;;
        m) MOUNT_PATH="$OPTARG" ;;
        t) export VAULT_TOKEN="$OPTARG" ;;
        a) export VAULT_ADDR="$OPTARG" ;;
        h) usage ;;
        \?) usage ;;
    esac
done

# Check if secret value is provided
if [ -z "$SECRET_VALUE" ]; then
    echo "Error: Secret value (-s) is required"
    usage
fi

# Function to check if a path exists in Vault
path_exists() {
    local path="$1"
    vault kv get -format=json "$path" >/dev/null 2>&1
    return $?
}

# Function to check if a value matches in a secret
check_secret() {
    local path="$1"
    local result
    
    # Try to get the secret
    result=$(vault kv get -format=json "$path" 2>/dev/null)
    if [ $? -eq 0 ]; then
        # For KV v2, data is nested under data.data
        if echo "$result" | jq -e '.data.data' >/dev/null 2>&1; then
            # Check if any value in the secret matches our search
            if echo "$result" | jq -r '.data.data | to_entries[] | .value' | grep -q "${SECRET_VALUE}"; then
                echo "Found match in: $path"
                echo "$result" | jq -r '.data.data | to_entries[] | select(.value | contains("'"${SECRET_VALUE}"'") | "  Key: \(.key)\n  Val: \(.value)"'
                echo "  Version: $(echo "$result" | jq -r '.data.metadata.version')"
                echo "  Created: $(echo "$result" | jq -r '.data.metadata.created_time')"
                echo
            fi
        else
            # KV v1 structure
            if echo "$result" | jq -r '.data | to_entries[] | .value' | grep -q "${SECRET_VALUE}"; then
                echo "Found match in: $path"
                echo "$result" | jq -r '.data | to_entries[] | select(.value | contains("'"${SECRET_VALUE}"'")) | "  Key: \(.key)\n  Val: \(.value)"'
                echo
            fi
        fi
    fi
}

# Function to recursively search through a path
search_path() {
    local current_path="$1"
    local list_result
    
    # List secrets at current path
    list_result=$(vault kv list -format=json "$current_path" 2>/dev/null)
    if [ $? -eq 0 ]; then
        # Process each item in the list
        echo "$list_result" | jq -r '.[]' | while read -r item; do
            local full_path
            
            # Handle paths with or without trailing slash
            if [[ "$current_path" == */ ]]; then
                full_path="${current_path}${item}"
            else
                full_path="${current_path}/${item}"
            fi
            
            # If item ends with /, it's a directory - recurse
            if [[ "$item" == */ ]]; then
                search_path "$full_path"
            else
                check_secret "$full_path"
            fi
        done
    else
        # If we can't list, try to read it as a secret
        check_secret "$current_path"
    fi
}

# Main execution
echo "Starting search for value: $SECRET_VALUE"
echo

if [ -n "$MOUNT_PATH" ]; then
    # Search specific mount path
    search_path "$MOUNT_PATH"
else
    # Get all secret engines and search each one
    vault secrets list -format=json | jq -r 'to_entries[] | select(.value.type == "kv") | .key' | while read -r mount; do
        echo "Searching mount: $mount"
        search_path "$mount"
    done
fi

echo "Search complete"
