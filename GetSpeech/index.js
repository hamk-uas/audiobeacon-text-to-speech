function badRequest() {
    context.res.status(400);
    context.res.send();
    return;
}

module.exports = async function (context, req) {
    // Check that all required URL parameters are present
    if (req.query["find_col"] === undefined || req.query["find_val"] === undefined || req.query["req_col"] === undefined) {
        await badRequest();
        return;
    }
    // Define audio format:
    const format = "ogg_opus"; // "ogg_opus", "mp3" or "wav"
    sampleRateHertz = 48000;

    // Audio format mime type, Google encoding string and file name extension
    const formatToMime = {
        "ogg_opus": "audio/ogg",
        "mp3": "audio/mpeg",
        "wav": "audio/vnd.wav"
    };
    const formatToAudioEncoding = {
        "ogg_opus": "OGG_OPUS",
        "mp3": "MP3",
        "wav": "LINEAR16"
    };
    const formatToExt = {
        "ogg_opus": ".ogg",
        "mp3": ".mp3",
        "wav": ".wav",
    };

    // Get URL parameters
    const findCol = req.query.find_col;
    const findVal = req.query.find_val;
    const reqLan = (req.query["req_lan"] !== undefined) ? req.query["req_lan"] : 'fi'; // Optional
    const reqCol = req.query.req_col;

    // Dependencies
    const fetch = require('node-fetch');
    const { BlobServiceClient } = require("@azure/storage-blob");  
    const cacheStorage = require('./cache-storage.json');

    // 1. Obtain speech strings from Google Sheet tsv (tab separated values)
    let speechString = undefined;
    let speechStringHash = undefined;
    const tsvPromise = fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSUOiQbEcR5pcVLqA4Afk8KpSHv6Y6rtnJLITk0xbQrsrgNxFNsbH2HcWer6g1qcnRPxLDFJu3CW4bF/pub?output=tsv") 
        .then(res => res.text())
        .then(function(tsv) {
            //context.log(tsv);
            const lines = tsv.split("\n");
            let findColIndex = undefined;
            let reqColIndex = undefined;
            lanCells = lines[0].split("\t");
            lines[1].split("\t").forEach(function(col, colIndex) {
                if (col === findCol) {
                    findColIndex = colIndex;
                } 
                if (col === reqCol && lanCells[colIndex] === reqLan) {
                    reqColIndex = colIndex;
                }
            });
            if (findColIndex !== undefined && reqColIndex !== undefined) {
                lines.slice(2).forEach(function (line) {
                    cells = line.split("\t")
                    if (cells[findColIndex] === findVal) {
                        speechString = cells[reqColIndex];
                        speechStringHash = require('crypto').createHash('sha256').update(speechString, 'utf8').digest('hex');
                    }
                });
            }
        });        

    // 2. Check if the file is in cache
    const fileName = findVal + '-' + reqLan + '-' + reqCol + formatToExt[format];
    let blobUrl = "https://soundbeaconfunc.blob.core.windows.net/sound-cache/" + fileName;    
    let blobServiceClient = undefined;
    let containerClient = undefined;
    let blobClient = undefined;
    let blobProperties = undefined;
    const blobPromise = (async function() {
        try {
            blobServiceClient = BlobServiceClient.fromConnectionString(cacheStorage.connStr);
            containerClient = blobServiceClient.getContainerClient("sound-cache");
            blobClient = containerClient.getBlobClient(fileName);
            blobProperties = await blobClient.getProperties();
            if (blobProperties["contentDisposition"] === undefined) { // See: https://www.devtrends.co.uk/blog/fixing-azure-blob-storage-content-disposition                
                blobProperties = undefined; // Signal that we can't use the cached file
                let blobServiceClientProperties = blobServiceClient.getProperties();
                blobServiceClientProperties.defaultServiceVersion = "2020-10-02";
                blobServiceClient.setProperties(blobServiceClientProperties);        
                // console.log("Blob " + blobUrl + " does not have contentDisposition set.");
            }
            } catch(err) {
            // console.log("Blob " + blobUrl + " not found.");
        }
    })();

    // Do the above things 1 and 2 asynchronously
    await Promise.all([tsvPromise, blobPromise]);

    // Is the cached file valid to use?
    if (blobProperties !== undefined && blobProperties.metadata.speechstringhash === speechStringHash) {
        // Redirect to cached file
        blobUrl += "?hash=" + speechStringHash;
        // console.log("Text string hash match! Redirecting to blob " + blobUrl)
        context.res.status(302);
        context.res.set('location', blobUrl);
        context.res.send();
        return;
    } else {
        // console.log("Text string hash mismatch! ");
    }

    // Could not find speech string in the table
    if (speechString === undefined) {
        await badRequest();
        return;
    }

    // The speech was not cached so synthesize speech using Google services
    const textToSpeech = require('@google-cloud/text-to-speech');
    const textToSpeechClient = new textToSpeech.TextToSpeechClient({
        keyFilename: 'GetSpeech/google-services.json'            
    });
    await textToSpeechClient.initialize();
    const [textToSpeechResponse] = await textToSpeechClient.synthesizeSpeech({                
        input: {text: speechString},
        voice: {languageCode: reqLan}, // , ssmlGender: 'FEMALE'
        audioConfig: {
            audioEncoding: formatToAudioEncoding[format],
            sampleRateHertz: sampleRateHertz
        }
    });

    // Return speech
    context.res.setHeader('Content-Disposition', 'attachment;filename=' + fileName); 
    context.res.setHeader('Content-Type', formatToMime[format]);
    context.log('Synthesize speech from string: "' + speechString + '" and cache it at ' + blobUrl);
    context.res.send(textToSpeechResponse.audioContent);

    // Cache speech
    await containerClient.uploadBlockBlob(fileName, textToSpeechResponse.audioContent, textToSpeechResponse.audioContent.byteLength, {
        "blobHTTPHeaders": {
            "blobContentType": 'audio/ogg', 
            "blobContentDisposition": 'attachment;filename=' + fileName
        }, 
        "metadata": {
            "speechstringhash": speechStringHash
        }
    });
} 