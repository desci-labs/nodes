# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2022-08-26

### Added

- Public share links for published nodes
- Torus web wallet integration
- Indexing smart contract events via The Graph node
- Detect Licenses from GitHub repo
- Added common code-specific licenses

## Changed

- Show publish state in Nodes Collection sidebar
- Improve keyword tag manager
- Improve PDF zoom toggle
- Fixed edge case for GitHub import
- Improve and simplify wallet management UX
- Fixed bug when deleting a component you're currently viewing
- Enhance resolution API (dcite spec)
- FAIR metadata button lights up when component metadata is filled
- VSCode preference stored between sessions

## Removed

- n/a

## [0.3.0] - 2022-08-22

### Added

- Ability to publish Nodes to Goerli blockchain
- Web3 Wallet management system
- Publish flow with errors checks
- Diff support between Node versions
- VSCode integration v1 (toggle in User Menu)
- Add FAIR metadata screen with keywords, description, license for each component
- Resolve Node versions via backend API
- Resolve components including code via URL using DCITE citation scheme
- Added share icon for Node

## Changed

- Improve performance of large PDFs
- Enhance PDF text selection
- Improve layouts for Modal popups
- Simplify/reduce motion of annotations
- Make toggle for PDF height/width work a bit better
- History tab loads from blockchain
- Can initiate annotation via ALT+mouse drag
- Enhanced github repo detection

## Removed

- n/a

## [0.2.0] - 2022-07-22

### Added

- Ability to zoom into PDF using touch devices, mousewheel, keyboard without zooming the UI controls (previously zooming in would ruin the UI)
- Progress bar when loading new Research Object
- Ability for frontend to set/override IPFS gateway (not user-facing feature yet)
- Mobile view, still WIP, but can support collapsing annotations onto page when zooming in vs cutting off annotation
- Error / performance tracing package
- Fancy load indicator when checking auth credentials on first load
- Edit zoom via textbox, make zoom step smaller with

### Changed

- Major change to PDF rendering engine to support zooming, mobile, and large PDFs with many images
- Made auth codes numeric
- PDF Toolbar icons indicate hover and download pending states
- Made "Create Annotation" LaTeX info notice less scary looking, and hidden under "help" link by default
- Auto-close Research Object Collection view when scrolling PDF or editing object
- Reduce network requests when pulling manifest file (improve object loading performance)

### Removed

- Cleaned up unused screens
