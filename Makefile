.PHONY: build
build: .env desci-contracts/.env
	$(MAKE) -C desci-models build
	$(MAKE) -C desci-contracts build
	$(MAKE) -C desci-server install
	$(MAKE) -C desci-repo install
<<<<<<< HEAD
	$(MAKE) -C sync-server install
=======
	$(MAKE) -C nodes-lib build
>>>>>>> develop

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
	$(MAKE) -C desci-repo clean

.PHONY: .env
.env: nodes-media/.env desci-repo/.env
	# Phony target, always runs but is idempotent
	# Copies example env if not present, and fails until MNEMONIC is set
	if [ ! -f .env ]; then cp .env.example .env; fi
	if ! grep -q MNEMONIC .env; then echo "ERROR: set MNEMONIC in .env"; exit 1; fi

desci-contracts/.env: .env
	grep "MNEMONIC" .env > desci-contracts/.env

nodes-media/.env:
	if [ ! -f nodes-media/.env ]; then cp nodes-media/.env.example nodes-media/.env; fi

desci-repo/.env:
	if [ ! -f desci-repo/.env ]; then cp desci-repo/.env.example desci-repo/.env; fi

desci-media-isolated/.env:
	if [ ! -f desci-media-isolated/.env ]; then cp desci-media-isolated/.env.example desci-media-isolated/.env; fi

