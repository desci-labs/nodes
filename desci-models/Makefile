.PHONY: install build

build: install
	yarn build
	# Link package for nodes-web
	yarn link

install:
	yarn --frozen-lockfile

clean:
	rm -rf node_modules
	rm -rf dist
	# Might fail if already unlinked, that's okay
	yarn unlink || true
