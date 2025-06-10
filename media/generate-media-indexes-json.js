const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mediaDir = __dirname;

const mediaTypes = {
  video: /\.(mp4|mov|mkv)$/i,
  image: /\.(jpg|jpeg|png)$/i,
  audio: /\.(mp3|wav|aac|m4a)$/i,
  text: /\.(txt|pdf)$/i,
};

function createImageThumbnail(src, dest) {
  try {
    execSync(`convert "${src}" -resize 200x200 "${dest}"`);
    console.log(`Thumbnail created: ${dest}`);
  } catch (e) {
    console.error(`Failed to create thumbnail for ${src}:`, e.message);
  }
}

function createVideoThumbnail(src, dest) {
  try {
    execSync(`ffmpeg -y -i "${src}" -ss 00:00:01.000 -vframes 1 -vf "scale=200:-1" "${dest}"`);
    console.log(`Thumbnail created: ${dest}`);
  } catch (e) {
    console.error(`Failed to create thumbnail for ${src}:`, e.message);
  }
}

function ensureThumbnails(subDir, type, files) {
  const thumbDir = path.join(subDir, `${type}-thumbnails`);
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir);
  }
  files.forEach(file => {
    const baseName = path.parse(file).name;
    const ext = type === 'image' ? '.jpg' : '.png';
    const thumbPath = path.join(thumbDir, `${baseName}${ext}`);
    if (!fs.existsSync(thumbPath)) {
      const srcPath = path.join(subDir, file);
      if (type === 'image') {
        createImageThumbnail(srcPath, thumbPath);
      } else if (type === 'video') {
        createVideoThumbnail(srcPath, thumbPath);
      }
    }
  });
}

// Utility function to replace the jsonMediaList block using comment markers
function replaceJsonMediaListBlock(html, embedContent) {
  return html.replace(
    /<!-- JSON_MEDIA_LIST_START -->([\s\S]*?)<!-- JSON_MEDIA_LIST_END -->/im,
    `<!-- JSON_MEDIA_LIST_START -->\n${embedContent}\n<!-- JSON_MEDIA_LIST_END -->`
  );
}

fs.readdir(mediaDir, { withFileTypes: true }, (err, entries) => {
  if (err) {
    console.error('Error reading media directory:', err);
    return;
  }

  entries.forEach(entry => {
    if (entry.isDirectory() && mediaTypes[entry.name]) {
      const subDir = path.join(mediaDir, entry.name);
      fs.readdir(subDir, (err, files) => {
        if (err) {
          console.error(`Error reading ${entry.name} directory:`, err);
          return;
        }
        const filtered = files.filter(f => mediaTypes[entry.name].test(f));
        if (entry.name === 'image' || entry.name === 'video') {
          ensureThumbnails(subDir, entry.name, filtered);
        }
        const mediaObjects = filtered.map(f => {
          const filePath = path.join(subDir, f);
          const stats = fs.statSync(filePath);

          let thumbnail = undefined;
          if (entry.name === 'audio') {
            thumbnail = '/media/audio/audio-thumbnails/audio-thumbnail.jpg';
          } else if (entry.name === 'text') {
            thumbnail = '/media/text/text-thumbnails/text-thumbnail.jpg';
          } else if (entry.name === 'image') {
            thumbnail = `image-thumbnails/${f.replace(/\.[^/.]+$/, '')}.jpg`;
          } else if (entry.name === 'video') {
            thumbnail = `video-thumbnails/${f.replace(/\.[^/.]+$/, '')}.png`;
          }

          return {
            name: f.replace(/\.[^/.]+$/, ''),
            path: f,
            type: entry.name,
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
            size: stats.size,
            description: "Description text for placeholder.",
            thumbnail
          };
        });

        // Write JSON file
        const jsonPath = path.join(subDir, `${entry.name}-index.json`);
        fs.writeFile(jsonPath, JSON.stringify(mediaObjects, null, 2), err => {
          if (err) {
            console.error(`Error writing ${entry.name}-index.json:`, err);
          } else {
            console.log(`${entry.name}-index.json updated.`);
          }
        });

        // Update HTML to embed the JSON file in the jsonMediaList div using comment markers
        const indexPath = path.join(subDir, `${entry.name}-index.html`);
        let html = '';
        try {
          html = fs.readFileSync(indexPath, 'utf8');
        } catch {
          console.warn(`${entry.name}-index.html does not exist. Skipping update.`);
          return;
        }

        const embedContent = `
  <div id="jsonMediaList"><p>Loading...</p>
    function formatDate(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    function formatSize(bytes) {
      if (bytes >= 1073741824) {
        return (bytes / 1073741824).toFixed(2) + ' GB';
      } else {
        return (bytes / 1048576).toFixed(2) + ' MB';
      }
    }
    fetch('${entry.name}-index.json')
      .then(r => r.json())
      .then(list => {
        const container = document.getElementById('jsonMediaList');
        if (!Array.isArray(list) || list.length === 0) {
          container.innerHTML = '<div>No files found.</div>';
        } else {
          container.innerHTML = '<div class="media-list-grid">' +
            list.map(function(obj) {
              var thumb = obj.thumbnail || '';
              return '<div class="media-item">' +
                '<a href="' + obj.path + '">' +
                  '<img src="' + thumb + '" alt="Thumbnail for ' + obj.name + '">' +
                '</a>' +
                '<div>' +
                  '<a href="' + obj.path + '">' + obj.name + '</a>' +
                '</div>' +
                '<div class="media-date">' +
                  formatDate(obj.created) +
                '</div>' +
                '<div class="media-size">' +
                  formatSize(obj.size) +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      })
      .catch(function() {
        document.getElementById('jsonMediaList').innerHTML = '<div>Error loading media list.</div>';
      });
</div>
`;

        const updatedHtml = replaceJsonMediaListBlock(html, embedContent);

        fs.writeFile(indexPath, updatedHtml, err => {
          if (err) {
            console.error(`Error updating ${entry.name}-index.html:`, err);
          } else {
            console.log(`${entry.name}-index.html updated with embedded JSON.`);
          }
        });
      });
    }
  });
});