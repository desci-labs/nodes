# Kubo -> Ceramic One migration

## If running in `ceramic-recon` pod:
```bash
apt-get update
apt-get install curl unzip groff less jq
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip
./aws/install
```

Authenticate:
```bash
aws configure
```

Note: remove `/root/.aws/credentials` when done!

## Bump `aws s3` concurrency
```bash
aws configure set default.s3.max_concurrent_requests 128
```

## Sync the blockstore data
Sync the blockstore (not much data, but 600k+ files):
```bash
# This is the mounted PV in the ceramic-recon-dev container
cd $CERAMIC_ONE_STORE_DIR
mkdir kubo-blockstore

# If initial copy (faster but dumb)
aws s3 cp --recursive s3://public-ceramic-ipfs-dev/public-ceramic-ipfs-dev-1 kubo-blockstore

# If topping up (slower but only transfers the delta)
aws s3 sync s3://public-ceramic-ipfs-dev/public-ceramic-ipfs-dev-1 kubo-blockstore
```

This is OK to cancel and resume, and follow-up runs will only transfer the delta.


## If syncinc locally locally: send to pod as tarball
There are so many files that it's a bit tricky to make a flat bundle efficiently, but we use `find` to get plain filenames without path, and feed `tar` filenames to include via `stdin`:
```bash
cd clay-blockstore
find . -name "CIQ*" -printf '%f\n' | tar czf clay-blockstore.tar.gz --files-from -
```

Copy the tarball to the pod with `kubectl cp` and extract to `$CERAMIC_ONE_STORE_DIR/kubo-blockstore`

## Run the block import

```bash
# Snapshot which blocks are are importing, so we can import deltas later
ls $CERAMIC_ONE_STORE_DIR/kubo-blockstore | sort > $CERAMIC_ONE_STORE_DIR/migration-info/first_run_blocks.txt

ceramic-one migrations from-ipfs \
  --input-ipfs-path $CERAMIC_ONE_STORE_DIR/kubo-blockstore \
  --input-file-list-path $CERAMIC_ONE_STORE_DIR/migration-info/first_run_blocks.txt \
  --non-sharded-paths \
  --output-store-path $CERAMIC_ONE_STORE_DIR \
  --network testnet-clay \
  --log-tile-docs \
  --log-format json \
  > "$CERAMIC_ONE_STORE_DIR/migration-info/log_$(date --iso-8601=minutes | sed 's|+00:00||').json" 2>&1
```

After this, you will have a fat `log_[date].json` with all the output from the import, and a `model_error_counts.csv` which aggregates errors per model. We ran the nodes with the "historical sync" mode for a while, and all of those blocks likely lead to errors.

At this point, what's important is that no errors happen for our `ResearchObject` model: `kjzl6hvfrbw6cbe01it6hlcwopsv4cqrqysho4f1xd7rtqxew9yag3x2wxczhz0`.

For subsequent refreshes:
```bash
# Sync block from kubo bucket
aws s3 sync ...

# Create new block list
ls $CERAMIC_ONE_STORE_DIR/kubo-blockstore | sort > $CERAMIC_ONE_STORE_DIR/migration-info/fresh_blocklist.txt

# Get the delta blocks
comm -13 $CERAMIC_ONE_STORE_DIR/migration-info/second_run_blocks.txt

# Run migration command again, but with the latest block delta:
ceramic-one migrations from-ipfs ... --input-file-list-path $CERAMIC_ONE_STORE_DIR/migration-info/second_run_blocks.txt
```