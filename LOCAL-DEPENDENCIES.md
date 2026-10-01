# Local development setup

## The short version

This repository depends on `@repid/sdk`, and right now that dependency points
at a **directory next to this one**, not at a published package:

```json
"@repid/sdk": "file:../repid-sdk"
```

So a fresh clone does not install on its own. Check out the SDK as a sibling:

```
BCH/
├── RepID 1.2/        <- this repository
├── repid-sdk/        <- the SDK, sibling of the demo
└── repid-protocol/   <- the normative specifications
```

Then, from this repository:

```bash
npm install
npm test
npm start
```

`npm install` links the local SDK and builds it (its `prepare` script), so a
change in `../repid-sdk/src` is picked up as soon as you re-run it. There is no
publish step and no version bump to coordinate while it works this way.

## Why it is like this

`@repid/sdk` is not on npm yet, because the final package name depends on the
final home of the `repid-protocol` repository (an organization, a scope, a URL
— none of them decided). Publishing under a name that later changes is worse
than not publishing: npm keeps the name, and the published spec lives forever
under the wrong one.

Using a local path was a deliberate choice over a placeholder version, because a
placeholder version is the kind of thing that survives a year: nobody notices it
is fake, and it is what everyone installs.

## When it changes

When the SDK is published, one edit in `package.json` replaces this file's
reason to exist, and this document is deleted:

```json
"@repid/sdk": "^<published version>"
```

## The npm resolution workaround

`.npmrc` sets `legacy-peer-deps=true`. Without it, `npm install` in this
repository fails with `Cannot read properties of null (reading 'edgesOut')` —
a crash in npm's own tree building, reproducible on npm 10.9.2, not a defect in
this project or in the SDK. It is required for `npm install`, `npm ci` and any
deployment build, which is why it lives in a file and not on a command line.
See the comment in `.npmrc` for the condition under which to remove it.

## What is *not* vendored

Fact recognition, the protocol constants and the fact schema are **not** copied
into this repository, and their tests are not duplicated here. The SDK reads the
constants and schema from `repid-protocol` and fails if the two disagree
(`npm run check:drift` in the SDK, run by its CI). A second copy of a
recognizer inside this repository would be a second thing to keep correct, with
no mechanism to detect that it had fallen behind.
