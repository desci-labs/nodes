# import required images from ipfs to local

wget https://ipfs.desci.com/ipfs/bafkreih6yx7ywj7trvpp45vergrnytad7ezsku75tefyro4qrrcfrrmrt4 -O /tmp/cover.png
curl -F file=@/tmp/cover.png "http://host.docker.internal:5001/api/v0/add?cid-version=1"