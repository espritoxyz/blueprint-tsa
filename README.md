# blueprint-tsa

A plugin for the [Blueprint Framework](https://github.com/ton-org/blueprint/) that simplifies your workflow with the [TON Symbolic Analyzer](https://tonsec.dev/).

## Getting Started

1. Add this plugin as a dependency of your Blueprint project:

```bash
yarn add blueprint-tsa
```

2. Add this configuration to `blueprint.config.ts`:

```ts
import {TsaPlugin} from "blueprint-tsa";

export const config = {
  plugins: [new TsaPlugin()],
};
```

## Usage

Run the following command:

```bash
yarn blueprint tsa help
```

More more information, visit [documentation](https://tonsec.dev/docs).
