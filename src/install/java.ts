import { adoptiumOS, adoptiumArch } from "./architecture.js";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";

export const apiLink =
  `https://api.adoptium.net/v3/binary/latest/11/ga/${adoptiumOS}/${adoptiumArch}/jre/hotspot/normal/eclipse`;

const downloadWithRedirect = (url: string, filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            response.resume();
            downloadWithRedirect(redirectUrl, filePath).then(resolve).catch(reject);
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

export const downloadTarWithJava = (filePath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    downloadWithRedirect(apiLink, filePath).then(resolve).catch(reject);
  });
};
