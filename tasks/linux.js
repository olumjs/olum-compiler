const inquirer = require("inquirer");
const fs = require("fs");
const path = require("path");
const extra = require("fs-extra");
const colors = require("colors");
const decompress = require("decompress");
const {exec} = require("child_process");
const packageJSON = require("../../../package.json");
const settings = packageJSON.olum;

const q1 = { type: "confirm", name: "nwjs", message: "NWjs is ready" };

const getIcon = () => {
  let filename = "favicon.png";
  const arr = settings.favicon.match(/\/(?:.(?!\/))+$/g);
  if (arr.length) filename = arr[0].replace(/\//g,"").trim();
  return filename;
}

const linux = (obj, resolve, reject) => {  
  if (obj.package == "deb") {
    // hint 
    console.log(`\nYou need to download ${colors.yellow("NWjs")} from ${colors.green(obj.link)}\nand paste it here ${colors.green("file://"+path.resolve(__dirname, "../nwjs"))}\n`);
    const nwjsDir = path.resolve(__dirname, `../nwjs`);
    if (!fs.existsSync(nwjsDir)) fs.mkdirSync(nwjsDir);

    // ask about nwjs
    inquirer.prompt([q1]).then(ans => {
      if (ans.nwjs) {
        const mainDir = path.resolve(__dirname,"../desktop");
        const anatomy = {
          dirs: [
            path.resolve(__dirname, `../desktop/${packageJSON.name}/DEBIAN`),
            path.resolve(__dirname, `../desktop/${packageJSON.name}/usr/share/applications`),
            path.resolve(__dirname, `../desktop/${packageJSON.name}/opt/${packageJSON.name}`),
          ],
          files: [
            {
              path: path.resolve(__dirname, `../desktop/${packageJSON.name}/DEBIAN/control`),
              content: 
`Package: ${packageJSON.name}
Version: ${packageJSON.version}
Architecture: all
Essential: no
Priority: optional
Maintainer: ${packageJSON.author}
Description: ${packageJSON.description}
Homepage: 
Installed-Size: SIZE
Depends:\n\n
`
            },
            {
              path: path.resolve(__dirname, `../desktop/${packageJSON.name}/DEBIAN/postinst`),
              content: 
`#!/bin/bash

# get the right user name of the os
userName=$SUDO_USER
# check if it's root
if [[ $EUID = 0 ]]; then
  userName=$SUDO_USER
# check if it's user
elif ! [[ $EUID = 0 ]]; then
  userName=$USER
fi

# copy .desktop file for activating the app launcher
cp /usr/share/applications/${packageJSON.name}.desktop /home/$userName/.local/share/applications

# changing the mode of all nw & nacl
cd /opt/${packageJSON.name} && chmod 775 *
`
            },
            {
              path: path.resolve(__dirname, `../desktop/${packageJSON.name}/DEBIAN/preinst`),
              content: 
`#!/bin/bash

# get the right user name of the os
userName=$SUDO_USER
# check if it's root
if [[ $EUID = 0 ]]; then
  userName=$SUDO_USER
# check if it's user
elif ! [[ $EUID = 0 ]]; then
  userName=$USER
fi

# remove old dir of ${packageJSON.name}
echo "Looking for old versions of ${packageJSON.name}..."
if [ -d /opt/${packageJSON.name} ]; then
  rm -r /opt/${packageJSON.name}
  echo "Removed old ${packageJSON.name} from /opt/${packageJSON.name}"
fi

echo "Looking for old config files..."
OLD_FILES="/home/$userName/.local/share/applications/${packageJSON.name}.desktop /usr/share/applications/${packageJSON.name}.desktop"
for OLD_FILE in $OLD_FILES
  do 
    if [ -f $OLD_FILE ]; then
      sudo rm $OLD_FILE
      echo "Removed $OLD_FILE"
    fi
done

# lock files
echo "Looking for lock files..."
LOCK_FILES="/var/cache/apt/archives/lock /var/lib/apt/lists/lock /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock"
for LOCK_FILE in $LOCK_FILES
  do 
    if [ -f $LOCK_FILE ]; then
      sudo rm -r $LOCK_FILE
      echo "Removed $LOCK_FILE"
    fi
done
`
            },
            {
              path: path.resolve(__dirname, `../desktop/${packageJSON.name}/usr/share/applications/${packageJSON.name}.desktop`),
              content: 
`[Desktop Entry]
Encoding=UTF-8
Version=1.0.0
Name=${packageJSON.name}
GenericName=${packageJSON.name}
Comment=${packageJSON.description}
Exec=/opt/${packageJSON.name}/nw
TryExec=/opt/${packageJSON.name}/nw
Icon=/opt/${packageJSON.name}/${settings.dest}/${getIcon()}
Categories=Utility;
Type=Application
Terminal=false
Keywords=web;software;
`
            },
            {
              path: path.resolve(__dirname, `../desktop/${packageJSON.name}/opt/${packageJSON.name}/package.json`),
              content: JSON.stringify({
                name: packageJSON.name,
                version: packageJSON.version,
                description: packageJSON.description,
                main: settings.dest + "/index.html",
                window: {
                  toolbar: true,
                  title: packageJSON.name,
                  icon: settings.dest + "/" + getIcon(),
                  width: 768,
                  height: 728,
                  min_width: 600,
                  min_height: 600,
                  position: "center",
                  "background-color": "#eeeeee"
                },
                "chromium-args": "--disable-web-security"
              },null,2)
            },
          ]
        };
      
        // clearn dekstop folder
        if (fs.existsSync(mainDir)) fs.rmdirSync(mainDir, { recursive: true });
    
        // create anatomy
        console.log(colors.yellow("\nInitializing debian anatomy..."));
    
        // directories
        anatomy.dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true }));
    
        // files
        anatomy.files.forEach(obj_ => {
          fs.writeFile(obj_.path, obj_.content, err => {
            if (err) {
              console.error(colors.red(err));
              return reject();
            }
            const arr = obj_.path.split("/");
            const fileName = arr[arr.length-1];
            console.log(` ${fileName} ${colors.green("[Done]")}`);
          });
        });
    
        // copy build folder 
        const buildSrc = path.resolve(__dirname, `../${settings.dest}`);
        const buildDest = path.resolve(__dirname, `../desktop/${packageJSON.name}/opt/${packageJSON.name}/${settings.dest}`);
        extra.copy(buildSrc, buildDest, err => {
          if (err) {
            console.error(colors.red(err));
            return reject();
          }
          console.log(colors.yellow(`\nCloning ${settings.dest} directory...`));
    
          // Extracting
          const nwjsSrc = path.resolve(__dirname, "../nwjs/" + obj.file);
          const nwjsDest = path.resolve(__dirname, `../desktop/${packageJSON.name}/opt/${packageJSON.name}`);
          if (!fs.existsSync(nwjsSrc)) {
            console.error(colors.red("\nCouldn't find " + obj.file));
            return reject();
          }

          console.log(colors.yellow(`Extracting ${obj.file}...`));
          decompress(nwjsSrc, path.resolve(__dirname, "../nwjs")).then(files => {
            // Cloning nwjs
            console.log(colors.yellow(`Cloning ${obj.file}...`));
            extra.copy(path.resolve(__dirname, `../nwjs/${obj.dir}/`), nwjsDest, err => {
              if (err) {
                console.error(colors.red(err));
                return reject();
              }
              
              // packaging
              const debPath = path.resolve(__dirname, `../desktop/${packageJSON.name}/DEBIAN`);
              const chmod = "chmod 755 *";
              const dpkg = `dpkg-deb --build ${packageJSON.name}`;
              const dpkgCheck = "whereis dpkg-deb";
              exec(dpkgCheck, (code, stdout, stderr) => {
                if (stderr) {
                  console.error(colors.red(stderr));
                  return reject();
                }

                if (stdout === "dpkg-deb:\n") {
                  console.log(colors.red("dpkg-deb is not installed"));
                  return reject();
                } else {
                  console.log(colors.green(`Packaging...`));
                  exec(`cd ${debPath} && ${chmod} && cd ../../ && ${dpkg}`, (code, stdout, stderr) => {
                    if (stderr) {
                      console.error(colors.red(stderr));
                      return reject();
                    }

                    console.log(colors.cyan(`Get your debian package from file://${path.resolve(__dirname, `../desktop`)}`));
                    resolve();
                  });
                }
              });

            });
          });
        });
        
      } else {
        console.error(colors.red("Can't proceed unless NWjs is ready"));
        return reject();
      }
    }).catch(reject);

  } else if (obj.package == "rpm") {
    console.log(colors.red("Not implemented yet!"));
    resolve();
  }
};

module.exports = linux;