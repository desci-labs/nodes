# import required images from ipfs to local

check_and_install() {
  echo "check and install: $1"
  # local shell_cmd = $1
  if ! command -v $1 &> /dev/null;
  then
    apt-get install -y $1
  fi
}

check_and_install "wget"
check_and_install "curl"

wget https://ipfs.desci.com/ipfs/bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4 -O /tmp/cover.png
curl -F file=@/tmp/cover.png "http://host.docker.internal:5001/api/v0/add?cid-version=1"