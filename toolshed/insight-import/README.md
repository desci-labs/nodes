# Insight Importer
This project contains tools for importing publications from Insight Journal to Nodes. The method might be useful for other imports, where there is static data for publication history that should be reflected in the history of new nodes.

## Method
An external git repo contains a metadata manifest, and optionally a cover image, for each publication. This _roughly_ corresponds to the ResearchoObject schema, but needs transforming. `sync.sh` grabs information from this repo, grabs referenced CIDs to articles, code and/or data, and the node scripts wrangles them into functional nodes with `nodes-lib`.

### Data fetching
These `metadata.json` files contain CIDs for article PDFs and code/data, per version, so the data necessary isn't contained in the repo. [`sync.sh`](./sync.sh) tries its best to filter out these CIDs and find them with `lassie`. Each parsed CID is saved as a CAR file in `local-data/cars/[cid].car`.

The output format looks like this:

```
 local-data
├──  cars
│   ├──  bafkreia2c64uqq226j3ion6muy75pvm6ayomqrgpqrmvuq2tyrsfcr6jpm.car
│   ├──  bafkreia3kapmuip4p42wrs7yrc4ykop75vfjgpyi2dnmyuttpz45zqmsxu.car
│   ├──  bafkreia4bjka5wovgbnvftxe55chrbk7urkp5lkmdj2av4k7qdff3xiyty.car
│   ├──  bafkreia4l6rrso2u53224wmps5ak6z4c4lczruzkolqtmjnn3ul5p7ffw4.car
│   ┆
│
├──  issues
│   ├──  1.json
│   ├──  156.json
│   ├──  157.json
│   ├──  162.json
│   ├──  166.json
│   ┆
│
└──  publications
    ├──  10
    │   ├──  data
    │   └──  metadata.json
    ├──  101
    │   └──  metadata.json
    ├──  102
    │   ├──  cover.jpeg
    │   └──  metadata.json
    ┆
```

Some notes:
- Not all publications have associated files (55, 424, ...)
- Not all have cover images (321, )

Some CIDs pare particulary elusive, but `sync.sh` will only retry failed fetches on re-runs. So, run sync a couple of times, checking the output and/or the `cids_[date].log` files to see how much is still left to find. It defaults to using https://nftstorage.link, which races multiple public gateways, because this is much faster in 95% of the cases, but falls back to dynamic peer discovery when it fails to resolve content that way. Some of the peers will be eeeextremely slow, but the next run  will probably try a new one so don't lose hope. 🌞

#### Manually get missing article CIDs
Some article CIDs not resolvable at all, but could be found in a bundle DAG holding article PDFs, found by sniffing the network requests made when loading them on insight-journal.org.

After `sync.sh` runs have stabilised, there are probably a bunch of persistent failure. Mainly articles, it seems. Run this script on your sync logfile to list context for the missing CIDs:

```bash
❯ ./analyseMissing.sh cids_2024-11-05T12:10:42Z.log
10 article bafybeifrq6agqtqbhhmfjve7we4wglgkce7gpexdxhltj7zyumhk3yjc7u
107 source_code bafybeiej3rxpc4gdy5lwtqapysrpov6g3jwmyq44d34lghynbsfeh7lnu4
110 source_code bafybeihooy64tij5yxald5lgcuzudnip3q3x6nehezaciupekr2shzizbe
116 source_code bafybeifka4mgty7d6inxfmloxcd2phad7sowx3vvkevveraqimsgkg2z2e
12 article bafybeidbie4scd6d5ku7b4dnyw5owhaxafmovawxrfocvzlbx2qexzyfa4
```

For articles, we can try rechunking the data found in the article DAG to arrive at the original CID. To do this, put the analysis results in a file and invoke `rebuildRawArticles.sh`. It's cool if there are non-articles in there too, they will be skipped:

```bash
❯ ./analyseMissing.sh cids_2024-11-05T12:10:42Z.log > missing.txt
❯ ./rebuildRawArticles.sh missing.txt
🚗 Article bafybeifrq6agqtqbhhmfjve7we4wglgkce7gpexdxhltj7zyumhk3yjc7u reconstructed for pub 10
🍃 Skipping non-article CID bafybeiej3rxpc4gdy5lwtqapysrpov6g3jwmyq44d34lghynbsfeh7lnu4 for pub 107
🚗 Article bafybeidbie4scd6d5ku7b4dnyw5owhaxafmovawxrfocvzlbx2qexzyfa4 reconstructed for pub 12
🍃 Skipping non-article CID bafybeiet5egbeltbu5nsr2i3nmd57c4prcfrzenbmzmkujj5trpwuayodq for pub 129
```

Try running `sync.sh` again and see if that fixed all the remaining CIDs!

#### Remote DAG imports
Many of these CIDs weren't resolvable over the DHT or IPNS, so to help their availability we import the DAGs to our public node. The `dag import` command pins the CAR root, which by default works recursively. Hence, all subgraphs will be pinned as well.

```bash
# Pins to the CF R2 public kubo node
./remoteDagImport.sh local-data/cars s3-public-ipfs-prod-8547f975ff-5sftc
```

This takes 20ish minutes to run, depending on your connection.

#### Export cover images
Run `covers.sh` to generate a CAR file for each cover photo, and send them to the public node as well:

```bash
./covers.sh
./remoteDagImport.sh local-data/covers s3-public-ipfs-prod-8547f975ff-5sftc
```

The `covers.sh` script writes the cover image CID to a new top-level field `coverImage`, that can be used to connect them when creating the manifest later.

### Node creation

#### Type generation
We use `quicktype` to generate types and parsers that match all of the IJ metadata files, so we can leverage type system to detect incompatabilities with `ResearchObject`. E.g., `null` instead of `undefined`, optionals, data shapes, etc.

This is checked in as [src/ijTypes.ts](src/ijTypes.ts), and can be regenerated with `npm run generate-types`.

#### Create nodes
1. Run `cp .env.example .env` and fill it in according to the instructions
2. Run `npm start`, which will start creating nodes using nodes-lib against the configured API.

## Noteworthy fields
Some IJ metadata fields are a bit different than what we're used to in `desci-models`.

### `abstract`
Suitable to use as `description`, but contains some HTML tags, `\r\n` line feeds, and raw unicode characters:

```
An Insight Toolkit (ITK) processing framework for segmentation using active contours without edges \r\nis presented in this paper. Our algorithm is based on the work of Chan and Vese [1] that uses level- \r\nsets to accomplish region segmentation in images with poor or no gradient information. The basic idea \r\nis to partion the image into two piecewise constant intensity regions. This work is in contrast to the \r\nlevel-set methods currently available in ITK which necessarily require gradient information. Similar to \r\nthose methods, the methods presented in this paper are also made ef\ufb01cient using a sparse implementation \r\nstrategy that solves the contour evolution PDE at the level-set boundary. The framework consists of 6 \r\nnew ITK \ufb01lters that inherit in succession from itk::SegmentationFilter. We include 2D/3D example \r\ncode, parameter settings and show the results generated on a 2D cardiac image.
```

The raw unicode is removed automatically when we copy it into `local-data`, but the others stay for now.

### `authors`
- No attached `role`, assume co-author?
- Ordering: in a bunch of cases this array isn't sorted, so rely on the `author_place` key for ordering
- Unclear what the `author[i].persona_id` maps to

### `reviews`
Peer-review entries. Unclear what the `reviews[i].author.author_id` field maps to.

Not sure what to do with these. 

### `comments`
Public (?) correspondence on the publication. Some is sort-of peer review-y, but some is very generic. Not sure what to do with these atm.

View pubs with comments:
```bash
cat local-data/publications/**/metadata.json | jq 'select(.publication.comments[] | length > 0)'
```

### `categories`
Similar to `ResearchField`, and much lower dimension than `tags` below. 1868 uses, but only 82 distinct categories. They do seem a bit more specific than research field though, as many of the categories does't have a dito `ResearchField`.

List tags:
```bash
cat local-data/publications/**/metadata.json | jq '.publication.categories[]'
```

### `tags`
Some overlap with our `ResearchField`, but leaning more toward free-form SEO keywords. It seems to be freetext because there are many similar entries, some have the "list" in a single entry, etc. Not sure how/if we should try to match with research fields, because it probably won't be super straight-forward. We have listed the component `keywords` as deprecated, which is kinda what this would be (on the article).

List all unique tags:
```bash
❯ cat local-data/publications/**/metadata.json | jq --raw-output 'select(.publication.tags != null) | .publication.tags[]' | sort --unique
```

<details>
  <summary>All tags (click to expand)</summary>

  ```
  Active appearance models
  Anisotropic blurring filters
  Atlas-based segmentation
  Bayesian Decision Theory
  Blurring filters
  CMake
  Classification
  Code memory optimization
  Code speed optimization
  Component Analysis and Discriminants
  DART
  DICOM
  Data
  Data Representation
  Decision trees and non-metric classification
  Deformable registration
  Density Estimation
  Density Functions
  Derivatives and Integrals
  Diffusion Tensor Imaging
  Discriminant Functions
  Distance maps
  Distributed computation
  Edge Detection
  Error Estimation
  Extreme Programming
  Feature extraction
  Filtering
  Generic Programming
  Geometric transforms
  Groupwise registration
  Higher order derivatives
  Hypothesis Testing
  IO
  Image
  Image pyramids
  Images
  Information Theory
  Iterative clustering
  Iterators
  Language binding
  Level sets
  Linear Algebra
  Mathematical Morphology
  Mathematics
  Mesh
  Missing and Noisy Features
  Mixture of densities
  Model-to-image registration
  Multi-classifier decision fusion
  Multi-modality registration
  Neighborhood filters
  Neural networks
  Non-parametric Techniques
  Objects
  Optimization
  Parallelization, SMP
  Parameter Techniques
  Path
  Point distribution models
  PointSet
  Probability
  Programming
  Reformating and tensor reorientation
  Region growing
  Registration
  Registration metrics
  Registration optimizers
  Regularization and filtering
  Resampling
  Segmentation
  Spatial Objects
  Statistical shape models
  Statistics on tensors
  Streaming
  Surface extraction
  Tensor image reconstruction
  Thresholding
  Tractography
  Transforms
  Unsupervised learning and clustering
  Watersheds
  ```
  
</details>

One indicator of things being a bit crazy is that there are 2167 tags used in total, and a whopping 1567 unique ones.
```bash 
cat local-data/publications/**/metadata.json | jq --raw-output 'select(.publication.tags != null) | .publication.tags[]' | wc -l        
2167

cat local-data/publications/**/metadata.json | jq --raw-output 'select(.publication.tags != null) | .publication.tags[]' | sort --unique | wc -l
1567
```

### `handle`
A handle.net reference alongside the DOIs, something we don't have support for atm. Example from the IJ webside:

```
Please use this identifier to cite or link to this publication: http://hdl.handle.net/1926/53
New: Prefer using the following doi: https://doi.org/10.54294/o48iej
```

### `citation_list`
There is a list of references parsed from latex `\cite` or PDF, which is matched against a CrossRef `query.bibliographic` request. If this has a good match (> 60), the corresponding DOI is included in the struct, but otherwise it isn't.

More info here:
- https://github.com/InsightSoftwareConsortium/InsightJournal/issues/70
- https://github.com/InsightSoftwareConsortium/InsightJournal/pull/74

Observations:
1. The citation isn't _necessarily_ to the right thing?
2. The `unstructured` key contains more stuff than the title
3. 

### `license`
Holds the full license instead of its code/identifier, but they all seem to be `CC-BY-3.0` so this is used as a constant in the import:

```bash
❯ cat local-data/publications/*/metadata.json | jq ".publication.license" | sort --unique
"You are licensing your work to Kitware Inc. under the\nCreative Commons Attribution License Version 3.0.\n\nKitware Inc. agrees to the following:\n\nKitware is free\n * to copy, distribute, display, and perform the work\n * to make derivative works\n * to make commercial use of the work\n\nUnder the following conditions:\n\\\"by Attribution\\\" - Kitware must attribute the work in the manner specified by the author or licensor.\n\n * For any reuse or distribution, they must make clear to others the license terms of this work.\n * Any of these conditions can be waived if they get permission from the copyright holder.\n\nYour fair use and other rights are in no way affected by the above.\n\nThis is a human-readable summary of the Legal Code (the full license) available at\nhttp://creativecommons.org/licenses/by/3.0/legalcode"
```
 ### Cover photo
Not in the metadata file, and not on IPFS. How should we handle this?
1. Pin and set in manifest?
2. Something else?
