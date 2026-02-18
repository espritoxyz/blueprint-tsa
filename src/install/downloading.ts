import https from "https";
import http from "http";
import fs from "fs";

const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

export const downloadWithRedirect = (
  url: string,
  filePath: string,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (
          response.statusCode &&
          REDIRECT_STATUS_CODES.includes(response.statusCode)
        ) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            response.resume();
            downloadWithRedirect(redirectUrl, filePath)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        const file = fs.createWriteStream(filePath);
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
        file.on("error", (err) => {
          fs.unlink(filePath, () => {});
          reject(err);
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
  });
};
