.PHONY: install build clean seed

seed: install
	# npx hardhat run scripts/migrateToNewContract.js --network ganache
	scripts/seed.sh "dpid migration" "migration-complete.json" "migrate"
	# scripts/seed.sh "dpid registry" "unknown-dpid.json" "deploy:dpid:ganache"
	# scripts/seed.sh "research object" "unknown-research-object.json" "deploy:ganache"

build: install
	yarn build

install:
	yarn --frozen-lockfile

clean:
	rm -f .openzeppelin/unknown-*.json
	rm -f .openzeppelin/migration-complete.json
	rm -rf cache artifacts/build-info artifacts/**/*.dbg.json
	rm -f subgraph/subgraph.yaml
	rm -rf node_modules
