# audiobeacon-text-to-speech
An Azure serverless function that uses Google text-to-speech API with Azure blob caching of audio files. For use with audio beacons.
Copyright 2021 Häme University of Applied Sciences
Released under MIT license.
Author: Olli.Niemitalo@hamk.fi

Google text-to-speech API synthesizes speech from text with suitable quality for use in audio beacons in buildings and outdoor spaces.
To prevent exposing the API key the API is used through this Azure serverless function with the API key not exposed to the user of the function.
To reduce API usage cost, results are cached in Azure blob storage, and also the text strings to be synthesized are limited to those found in a TSV table (published to web from a Google sheets, see a snapshot: https://github.com/hamk-uas/audiobeacon-text-to-speech/blob/master/example.tsv) with limited edit access.
The function URL parameters determine where in the table the text string is obtained from.
Example URL with current Azure deployment: https://soundbeaconfunc.azurewebsites.net/api/getspeech?find_col=beacon_id&find_val=ovi_sisaan&req_col=message_1&req_lan=fi

The TSV file has a two-row header.
The correct data row is found using parameters find_col and find_val.
The parameter find_col must contain a string that appears in the 2nd row of the header.
On the same column, a value find_val is looked up in the data. The speech string will be on the row where that value was found, on the column that matches req_lan in the 1st row of the header.

A SHA-256 hash is calculated from the speech text string. The function returns a redirect to the cached audio file if the cached file has an x-ms-meta-speechstringhash header matching the hash.
Otherwise the speech is synthesized and cached with the new hash in x-ms-meta-speechstringhash.

Two secrets are needed, with censored examples:

GetSpeech/cache-storage.json:
```
{
    "key": "****************************************************************************************",
    "connStr": "DefaultEndpointsProtocol=https;AccountName=soundbeaconfunc;AccountKey=****************************************************************************************;EndpointSuffix=core.windows.net"
}
```

GetSpeech/google-services.json:
```
{
  "type": "service_account",
  "project_id": "***********",
  "private_key_id": "****************************************",
  "private_key": "-----BEGIN PRIVATE KEY-----\n***...***\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account-for-***@***************.gserviceaccount.com",
  "client_id": "*********************",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/service-account-for-*********************.gserviceaccount.com"
}
```
