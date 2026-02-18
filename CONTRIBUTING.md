## Building and testing locally

1. Build this plugin:
   ```
   yarn build
   ```
2. Link it:

   ```
   yarn link
   ```

3. Create a new Blueprint project:

   ```
   npm create ton@latest
   cd <project name>
   ```

4. Add this plugin from the project's directory via [link](https://classic.yarnpkg.com/lang/en/docs/cli/link/):

   ```
   yarn link blueprint-tsa
   ```

5. Add the Blueprint configuration to the project:

   ```typescript
   // blueprint.config.ts in <project dir>:

   import { TsaPlugin } from "blueprint-tsa";

   export const config = {
     plugins: [new TsaPlugin()],
   };
   ```

6. Test the plugin calling the following command in the project directory:
   ```bash
   yarn blueprint tsa
   ```

## Linters

Before pushing the code to the remote repository, format it using `yarn prettier . --write`

On the CI [pipeline](.github/workflows/prettier.yml), the following checks are run:

```
yarn prettier . --check
yarn lint --max-warnings 0
```
