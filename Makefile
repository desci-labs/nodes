.PHONY: build
build: .env
	$(MAKE) -C desci-models build
	$(MAKE) -C desci-contracts build

.PHONY: sterile
sterile: clean
	sudo rm -rf local-data

.PHONY: clean
clean:
	rm -rf local-data/ganache
	./resetTables.sh

	# Down stops and removes containers
	docker compose -p desci down
	docker container prune --force

	$(MAKE) -C desci-contracts clean
	$(MAKE) -C desci-models clean

.PHONY: .env
.env: desci-contracts/.env nodes-media/.env
	# Phony target, always runs but is idempotent
	# Copies example env if not present, and fails until MNEMONIC is set
	cp --no-clobber .env.example .env || true
	if ! grep -q MNEMONIC .env; then echo "ERROR: set MNEMONIC in .env"; exit 1; fi

desci-contracts/.env:
	grep "MNEMONIC" .env > desci-contracts/.env

nodes-media/.env:
	cp nodes-media/.env.example nodes-media/.env

