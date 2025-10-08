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


## If syncing locally: send to pod as tarball
There are so many files that it's a bit tricky to make a flat bundle efficiently, but we use `find` to get plain filenames without path, and feed `tar` filenames to include via `stdin`:
```bash
cd clay-blockstore
find . -name "CIQ*" -printf '%f\n' | tar czf clay-blockstore.tar.gz --files-from -
```

Copy the tarball to the pod with `kubectl cp` and extract to `$CERAMIC_ONE_STORE_DIR/kubo-blockstore`

## Run the block import

```bash
# Snapshot which blocks are are importing, so we can import deltas later
find $CERAMIC_ONE_STORE_DIR/kubo-blockstore -type f \
  | sort \
  > $CERAMIC_ONE_STORE_DIR/migration-info/blocks_run_1.txt

ceramic-one migrations from-ipfs \
  --input-ipfs-path $CERAMIC_ONE_STORE_DIR/kubo-blockstore \
  --input-file-list-path $CERAMIC_ONE_STORE_DIR/migration-info/blocks_run_1.txt \
  --non-sharded-paths \
  --output-store-path $CERAMIC_ONE_STORE_DIR \
  --network testnet-clay \
  --log-format json \
  > "$CERAMIC_ONE_STORE_DIR/migration-info/log_$(date --iso-8601=minutes | sed 's|+00:00||').json" 2>&1


  # With filtering / validation
  ceramic-one migrations from-ipfs \
    --input-ipfs-path $CERAMIC_ONE_STORE_DIR/kubo-blockstore \
    --input-file-list-path $CERAMIC_ONE_STORE_DIR/migration-info/blocks_run_1.txt \
    --non-sharded-paths \
    --output-store-path $CERAMIC_ONE_STORE_DIR \
    --network testnet-clay \
    --validate-signatures \
    --model-filter='kjzl6hvfrbw6cbe01it6hlcwopsv4cqrqysho4f1xd7rtqxew9yag3x2wxczhz0,kh4q0ozorrgaq2mezktnrmdwleo1d' \
    --log-format json \
    > "$CERAMIC_ONE_STORE_DIR/migration-info/log_$(date --iso-8601=minutes | sed 's|+00:00||').json" \
    2>&1
```

After this, you will have a fat `log_[date].json` with all the output from the import, and a `model_error_counts.csv` which aggregates errors per model. We ran the nodes with the "historical sync" mode for a while, and all of those blocks likely lead to errors.

At this point, what's important is that no errors happen for our `ResearchObject` model (`kjzl6hvfrbw6cbe01it6hlcwopsv4cqrqysho4f1xd7rtqxew9yag3x2wxczhz0`):

```bash
# Should print "No match!"
grep kjzl6hvfrbw6cbe01it6hlcwopsv4cqrqysho4f1xd7rtqxew9yag3x2wxczhz0 model_error_counts.csv || echo "No match!"
```

Note: on dev, there should/might be 18 errors. Grep on the same model ID in the log file, and all related errors should be mismatched chainID's in the controller (`11155420` vs `11155111`):
```json
{
  "timestamp": "2025-06-03T09:05:26.289302Z",
  "level": "ERROR",
  "fields": {
    "message": "error processing block",
    "cid": "bagcqceravakeblrrcm7sh6owcau5nzrkwpvaowg2u6ytrzoxk6joym3amota",
    "err": "fatal error: invalid_jws: 'did:pkh:eip155:11155420:0xdaf8752ddcce8a6b709aa271e7efc60f75cddf64' not in controllers list for issuer: 'did:pkh:eip155:11155111:0xdaf8752ddcce8a6b709aa271e7efc60f75cddf64'",
    "model": "kjzl6hvfrbw6cbe01it6hlcwopsv4cqrqysho4f1xd7rtqxew9yag3x2wxczhz0"
  },
  "target": "ceramic_event_svc::event::migration",
  "span": {
    "name": "migrate"
  },
  "spans": [
    {
      "name": "migrate"
    }
  ]
}
```

### For subsequent refreshes:
```bash
# Sync block from kubo bucket
aws s3 sync ...

# Create an updated list of absolute paths to all synced blocks
find $CERAMIC_ONE_STORE_DIR/kubo-blockstore -type f \
  | sort \
  > $CERAMIC_ONE_STORE_DIR/migration-info/all_blocks.txt

# Find the blocks not included in the last (TODO: or other previous?) run
# NOTE: replace X and X+1 with the next numbers to keep the old lists
comm -13 \
  $CERAMIC_ONE_STORE_DIR/migration-info/blocks_run_X.txt \
  $CERAMIC_ONE_STORE_DIR/migration-info/all_blocks.txt \
  > blocks_run_X+1.txt

# Run migration command again, but with the latest block delta
# NOTE: replace X+1 with the latest file
ceramic-one migrations from-ipfs ... --input-file-list-path $CERAMIC_ONE_STORE_DIR/migration-info/blocks_run_X+1.txt
```
