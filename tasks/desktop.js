const inquirer = require("inquirer");
const linux = require("./linux");
const windows = require("./windows");
const mac = require("./mac");


// Questions
const q1 = { type: "confirm", name: "desktop", message: "Do you want to package a desktop app" };
const q2 = { type: "list", name: "bit", message: "Choose processor type", choices: ["32-Bit", "64-Bit"] };
const q3 = { type: "list", name: "os", message: "Choose an operating system", choices: ["Linux", "Windows" , "Mac"] };
const q4 = { type: "list", name: "linuxPackage", message: "Choose linux package", choices: ["deb", "rpm"] };

const ver = "v0.39.0";
let link =`https://dl.nwjs.io/${ver}/`;
let file;
let dir;

const desktop = () => {
  const taskName = "desktop";
  return new Promise((resolve, reject) => {
    inquirer.prompt([q1]).then(ans => {
        if (!ans.desktop) return resolve();

        inquirer.prompt([q2]).then(ans2 => {
          const bit = +ans2.bit.replace(/\D/gi, "");

          inquirer.prompt([q3]).then(ans3 => {
            const os = ans3.os.toLowerCase();

            if (os == "linux") {
              dir = `nwjs-${ver}-linux-${bit == 64 ? "x"+bit : "ia"+bit}`;
              file = dir + ".tar.gz";
              link += file;

              inquirer.prompt([q4]).then(ans4 => {
                const linuxPackage = ans4.linuxPackage.toLowerCase();
                linux({os, ver, bit, package:linuxPackage, link, file, dir}, resolve, reject);
              }).catch(reject);

            } else if (os == "windows") {
              dir = `nwjs-${ver}-win-${bit == 64 ? "x"+bit : "ia"+bit}`;
              file = dir + ".zip";
              link += file;
              windows({os, ver, bit, link, file, dir}, resolve, reject);

            } else if (os == "mac") {
              dir = `nwjs-${ver}-osx-x64`;
              file = dir + ".zip";
              link += file;
              mac({os, ver, bit, link, file, dir}, resolve, reject);

            }

          }).catch(reject);

        }).catch(reject);

    }).catch(reject);

  });
};

module.exports = desktop;