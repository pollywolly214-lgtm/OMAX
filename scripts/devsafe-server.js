"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".json":"application/json" };
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const file=path.resolve(root,"."+pathname+(pathname.endsWith("/")?"index.html":""));
  if(!file.startsWith(root+path.sep) || pathname.split("/").some(part=>part.startsWith("."))){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(error?"Not found":data);});
}).listen(8000,"127.0.0.1",()=>console.log("OMAX local fixtures: http://localhost:8000/?devsafe=1"));
