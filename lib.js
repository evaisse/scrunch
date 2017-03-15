/**
 * 
 * 
 * @see https://www.sitepoint.com/common-pitfalls-avoid-using-html5-application-cache/
 */
var fs = require('fs');
var file = require('grunt').file;
var md5file = require('md5-file');
var cheerio = require('cheerio');
var checksum = require('checksum');
var riot = require('riot');
var glob = require('glob');
var cssnano = require('cssnano');
var CleanCSS = require('clean-css');
var UglifyJS = require("uglify-js");
var css = [];
var js = [];
var preprocessors = [];
var mkdirp = require('mkdirp');
var pub = __dirname + "/public";
var bundleRef = '/bundle';
var bundleFolder = pub + '/' + bundleRef;

var $ = cheerio.load(fs.readFileSync(__dirname + '/public/index.html') + "");
var cleanupList = [];
file.mkdir(bundleFolder);

/**
 * Compile riot JS files
 * @param  {[type]} tagFile [description]
 * @return {[type]}         [description]
 */
function compileRiot(tagFile) {
    var relPath = bundleRef + '/' + tagFile.replace(/\.tag\.html$/, '.tag.html.js'),
        srcPath = bundleFolder + '/' + tagFile.replace(/\.tag\.html$/, '.tag.html.js');
    file.write(srcPath, 
               riot.compile(fs.readFileSync(pub + '/' + tagFile) + ""));
    // cleanupList.push(srcPath);
    return relPath;
}

/*
    Parse stylesheets
 */
$('link[rel="stylesheet"]').each(function (i, el) {
    css.push($(el).attr('href'));
}).remove();

/*
    Parse javascripts
 */
$('script').each(function (i, el) {
    var path = $(el).attr('src');
    if (path.match(/\.tag\.html$/)) {
        path = compileRiot(path);
    }
    js.push(path);
}).remove();


/*
    Build synth
 */
console.log(css, js);


/**
 * CSS minification process
 */
var cssProcess = new Promise(function (resolve, reject) {

    var cssFiles = {};

    css.map(function (f) { 
        cssFiles[f] = {
            styles: fs.readFileSync(pub + '/' + f) + '',
        };
    });

    new CleanCSS({ 
        sourceMap: true, 
        target: bundleFolder, 
        keepSpecialComments: 0 
    }).minify(cssFiles, function (err, ok) {

        if (err) {
            return reject(err);
        }
        
        file.write(bundleFolder + '/bundle.css', ok.styles + "\n/*# sourceMappingURL=/bundle/bundle.css.map */");
        file.write(bundleFolder + '/bundle.css.map', ok.sourceMap + '');

        cleanupList.push(bundleFolder + '/bundle.css');
        cleanupList.push(bundleFolder + '/bundle.css.map');

        resolve(ok);
    });

});

/**
 * JS minification process
 */
var jsProcess = new Promise(function (resolve, reject) {

    try {
        var jsFiles = js.map(function (f) {
            return pub + '/' + f;
        });


        var jsBundle = UglifyJS.minify(jsFiles, {
            outSourceMap: "/bundle/bundle.js.map",
            sourceRoot: '/'
        });

        file.write(bundleFolder + '/bundle.js', jsBundle.code);
        file.write(bundleFolder + '/bundle.js.map', jsBundle.map);

        cleanupList.push(bundleFolder + '/bundle.js');
        cleanupList.push(bundleFolder + '/bundle.js.map');

        resolve(jsFiles);
    } catch (e) {
        reject(e);
    }

});



Promise.all([cssProcess, jsProcess]).then(function (result) {

    var html, 
        buildInfos = {
            files: []
        },
        manifest = [
            'CACHE MANIFEST',
            '# ' + new Date(),
            '',
            'CACHE:',
        ];

    ['js', 'css'].forEach(function (k) {

        var path = bundleFolder + '/bundle.' + k,
            checksum = md5file.sync(path),
            content = file.read(path),
            sourceMapContent = file.read(path + '.map');

        // rewrite sourcemap link
        content = content.replace('/bundle/bundle.' + k, '/bundle/bundle.' + checksum + '.' + k);
        sourceMapContent = JSON.parse(sourceMapContent);
        // sourceMapContent = sourceMapContent.replace('/bundle/bundle.' + k, '/bundle/bundle.' + checksum + '.' + k)
        sourceMapContent.sourceRoot = '';
        sourceMapContent.file = '/bundle/bundle.' + checksum + '.' + k + '.map';
        sourceMapContent.sources.forEach(function (f, i) {
            var o = f;
            f = f.replace(/\/\/+/, '/');
            if (f.indexOf(pub) === 0) {
                f = f.substr(pub.length);
            }
            if (f[0] !== '/') {
                f = '/' + f;
            }
            sourceMapContent.sources[i] = f;
            // console.log('Rewrite ', o, ' => ', f, pub);
        });

        file.write(bundleFolder + '/bundle.' + checksum + '.' + k, content);
        file.write(bundleFolder + '/bundle.' + checksum + '.' + k + '.map', JSON.stringify(sourceMapContent)); 

        switch (k) {
            case 'css':
                $('html > head').append('<link rel="stylesheet" href="' + bundleRef + '/bundle.' + checksum + '.css"/>');
                buildInfos.files.push(bundleRef + '/bundle.' + checksum + '.css');
                break;
            case 'js':
                $('html > body').append('<script type="text/javascript" src="' + bundleRef + '/bundle.' + checksum + '.js"></script>');
                buildInfos.files.push(bundleRef + '/bundle.' + checksum + '.js');
                break;
        }

    });

    if (!cli.appcache) {
        console.log('Write manifest file');
        $('html').attr('manifest', '/bundle.appcache');
        manifest = manifest.concat(buildInfos.files);
        manifest.push('');
        manifest.push('NETWORK:');
        manifest.push('*');
        file.write(pub + '/bundle.appcache', manifest.join('\n'));
        console.log('Write HTML bundle file');
    }

    console.log('Write assets bundle.json');

    file.write(bundleFolder + '/bundle.json', JSON.stringify(buildInfos));

    html = $.html();
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    file.write(pub + '/bundle.html', html);

}, function (err) {

    console.error('Problème', err);

}).then(function (ok) {


    /*
        Cleanup
     */
    cleanupList.forEach(function (fp) {
        file.delete(fp);
    });
    console.log('Delete files, cleanup build', cleanupList);
    
}, function (err) { 

    console.error(err); 

});