const inquirer = require("inquirer");
const fs = require("fs");
const path = require("path");

// Questions
const q1 = { type: "confirm", name: "catch", message: "Do you want to catch all routes to fall back to root" };
const q2 = { type: "input", name: "routes", message: "Add the desired routes separated by a comma" };

const catchAll = () => {
  const taskName = "catchall";
  return new Promise((resolve, reject) => {
    inquirer.prompt([q1]).then(ans => {
      if (!ans.catch) return resolve();
      inquirer.prompt([q2]).then(ans2 => {
        const file = path.resolve(__dirname, `../build/index.html`);
        if (fs.existsSync(file)) {
          fs.readFile(file, "utf8", (err, data) => {
            if (err) return reject(err);
  
            const routes = ans2.routes.split(",");
            routes.forEach(route => {
              route = route.trim();
              const newFile = path.resolve(__dirname, `../build/${route}.html`);
              fs.writeFile(newFile, data, err => {
                if (err) return reject(err);
                resolve();
              });
            });
  
          });
        } else {
          reject(`index.html doesn't exist in build directory!`);
        }
      }).catch(reject);
    }).catch(reject);
  });
};

module.exports = catchAll;