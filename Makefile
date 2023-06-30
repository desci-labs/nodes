.PHONY: build
build: .env
	$(MAKE) -C desci-models build
	$(MAKE) -C desci-contracts build

.PHONY: sterile
sterile: clean
	sudo rm -rf local-data
	# Too aggro?
  # docker system prune --all --force

.PHONY: clean
clean:
	rm -rf node_modules
	rm -rf local-data/ganache
	./resetTables.sh

	# Down stops and removes containers
	# Remove volumes for ganache and graph node
	#docker compose -p desci down --volumes desci_blockchain_ganache graph_node
	# Bring down the rest
	docker compose -p desci down
	docker container prune --force

	$(MAKE) -C desci-contracts clean
	$(MAKE) -C desci-models clean

.PHONY: .env
.env:
	# Phony target, always runs but is idempotent
	# Copies example env if not present, and fails until MNEMONIC is set
	cp --no-clobber .env.example .env || true
	if ! grep -q MNEMONIC .env; then echo "ERROR: set MNEMONIC in .env"; exit 1; fi

desci-contracts/.env: .env
	grep "MNEMONIC" .env > desci-contracts/.env

nodes-media/.env: .env
	cp nodes-media/.env.example nodes-media/.env

