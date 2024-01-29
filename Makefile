.PHONY: build
build: .env desci-contracts/.env
	$(MAKE) -C desci-models build
	$(MAKE) -C desci-contracts build
	$(MAKE) -C desci-server install

.PHONY: sterile
sterile: clean-rec
	# Remove containers and volumes
	docker compose -p desci down --volumes
	sudo rm -rf local-data

.PHONY: clean
clean: clean-rec
	rm -rf local-data/ganache
	./resetTables.sh

	# Down stops and removes containers
	docker compose -p desci down

.PHONY: clean-rec
clean-rec:
	$(MAKE) -C desci-contracts clean
	$(MAKE) -C desci-models clean
	$(MAKE) -C desci-server clean

.PHONY: .env
.env: nodes-media/.env desci-repo/.env
	# Phony target, always runs but is idempotent
	# Copies example env if not present, and fails until MNEMONIC is set
	cp --no-clobber .env.example .env || true
	if ! grep -q MNEMONIC .env; then echo "ERROR: set MNEMONIC in .env"; exit 1; fi

desci-contracts/.env: .env
	grep "MNEMONIC" .env > desci-contracts/.env

nodes-media/.env:
	cp nodes-media/.env.example nodes-media/.env

desci-repo/.env:
	cp desci-repo/.env.example desci-repo/.env

