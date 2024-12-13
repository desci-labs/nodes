.PHONY: install build

build: install
	npm run build

install:
	npm ci --no-fund --no-audit

clean:
	rm -rf node_modules
	rm -rf dist
