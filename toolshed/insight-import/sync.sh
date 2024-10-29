#! /bin/env bash

set -euo pipefail

if ! command -v lassie > /dev/null; then
  echo '🙅 Lassie and go-car are required, please install these tools!'
  echo "👉 https://github.com/filecoin-project/lassie?tab=readme-ov-file#installation"
  # shellcheck disable=SC2016
  echo '(psst, make sure ~/go/bin is in your $PATH !)'
  exit 1
fi

insight_path=.insight-journal-clone
data_path=local-data
logfile="cids_$(date --iso-8601=seconds --utc | sed 's/+00:00/Z/').log"

# Refresh cloned state
mkdir -p $data_path/{issues,publications}

if [ -d $insight_path ]; then
  cd $insight_path
  git pull --ff-only --depth=1 > /dev/null
  cd -
else
  git clone --depth=1 \
    git@github.com:InsightSoftwareConsortium/InsightJournal.git \
    $insight_path > /dev/null
fi

# Copy issue manifests
cp $insight_path/data/issues/*.json $data_path/issues

verify () {
  local cid=$1
  local file=$2
  car verify "$file" && car root "$file" | grep -q "$cid"
}

download () {
  local cid=$1
  local target=$2
  lassie fetch\
    --output "$target" \
    --providers='https://nftstorage.link' \
    --provider-timeout=20s \
    "$cid"
}

fetch () {
  local cid=$1
  local outdir=$2
  local target="$outdir/data/$cid.car"

  # if we have a file for this CID, verify the content
  if [ -f "$target" ]; then
    if verify "$cid" "$target"; then
      echo "HAS $cid" | tee -a "$logfile"
      return
    else
      # delete and retry if the car fails checks
      echo "DEL $cid" | tee -a "$logfile"
      rm "$target"
    fi
  fi

  if download "$cid" "$target" && verify "$cid" "$target"; then
    echo "GOT $cid" | tee -a "$logfile"
  else
    # lassie exited nonzero; delete just in case it's partial
    echo "ERR $cid" | tee -a "$logfile"
    rm -f "$target"
  fi
}

# use process subst and only interrupt between iterations to not abort mid write
while read -r file; do
  pub_id=$(basename "$(dirname "$file")")
  outdir="$data_path/publications/${pub_id}"
  mkdir -p "$outdir"

  cp "$file" "$outdir"

  cover_file=$(dirname "$file")/cover.jpeg
  if [ -f "$cover_file" ]; then
    cp "$cover_file" "$outdir/cover.jpeg"
  fi

  cids=$(grep -Eo 'b[0-9a-z]{58}' "$file" || true)
  if [ -n "$cids" ]; then 
    mkdir -p "$outdir/data"
    while read -r cid; do
      fetch "$cid" "$outdir"
    done <<< "$cids"
  fi
done < <(find $insight_path/data/publications -type f -name "metadata.json")

echo "Data fetch successful 🏁"
echo "Finished at $(date --iso-8601=seconds --utc | sed 's/+00:00/Z/')"
