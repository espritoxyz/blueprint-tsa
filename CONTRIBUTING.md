## Building and testing locally

1. Build this plugin:
    ```
    yarn build
    ```
2. Link it:
   ```
   yarn link
   ```

2. Create a new Blueprint project:
    ```
    npm create ton@latest
    cd <project name>
    ```

3. Add this plugin from the project's directory via [link](https://classic.yarnpkg.com/lang/en/docs/cli/link/):
    ```
    yarn link blueprint-tsa
    ```

4. Add the Blueprint configuration to the project:
    ```typescript
    // blueprint.config.ts in <project dir>:
   
    import { TsaPlugin } from 'blueprint-tsa';
    
    export const config = {
        plugins: [
            new TsaPlugin(),
        ],
    };
    ```

5. Test the plugin calling the following command in the project directory:
    ```bash
    yarn blueprint tsa
    ```
