.PHONY: install build clean seed

seed:
	scripts/seedLocalDpid.sh
	scripts/seedLocalChain.sh

build: install
	yarn build

install:
	yarn --frozen-lockfile

clean:
	rm -f .openzeppelin/unknown-*.json
	rm -rf cache artifacts/build-info artifacts/**/*.dbg.json
	rm -f subgraph/subgraph.yaml
	rm -rf node_modules
