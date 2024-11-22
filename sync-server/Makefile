.PHONY: install clean

install:
	yarn --frozen-lockfile

clean:
	rm -rf node_modules
	rm -rf .wrangler
	rm worker.capnp

build:
	scripts/build.sh