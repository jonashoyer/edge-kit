const fs = require('fs').promises;
const path = require('path');

const ALLOWED_EXTENSIONS = ['.tsx', '.ts', '.md'];

function setNestedValue(obj, pathArray, value) {
  let current = obj;
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i];
    current[key] = current[key] || {};
    current = current[key];
  }
  current[pathArray[pathArray.length - 1]] = value;
}

async function scanDirectory(dir) {
  const fileMap = {};
  
  async function scan(currentPath) {
    const files = await fs.readdir(currentPath);
    
    for (const file of files) {
      const filePath = path.join(currentPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await scan(filePath);
      } else if (ALLOWED_EXTENSIONS.includes(path.extname(file))) {
        const relativePath = path.relative('src', filePath).replace(/\\/g, '/');
        const content = await fs.readFile(filePath, 'utf-8');
        const pathParts = relativePath.split('/');
        setNestedValue(fileMap, pathParts, content);
      }
    }
  }
  
  await scan(dir);
  return fileMap;
}

async function main() {
  try {
    const fileMap = await scanDirectory('src');
    
    // Add root README.md
    try {
      const readmeContent = await fs.readFile('README.md', 'utf-8');
      fileMap['README.md'] = readmeContent;
    } catch (e) {
      console.warn('⚠️ Root README.md not found');
    }

    await fs.writeFile(
      'source-map.json',
      JSON.stringify(fileMap, null, 2)
    );
    console.log('✅ File map generated successfully');
  } catch (error) {
    console.error('❌ Error generating file map:', error);
    process.exit(1);
  }
}

main(); 