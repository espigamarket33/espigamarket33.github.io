#!/usr/bin/env node
/* Genera las versiones para Telegram (tg/esquiva.html, tg/toca.html, tg/cuanto.html)
   a partir de los juegos web de la raíz. Los juegos web NO se modifican.
   Uso: node tools/build-tg.js   (vuelve a correrlo cada vez que cambies un juego) */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const SDK='<script src="https://telegram.org/js/telegram-web-app.js"></script>';
const games=['esquiva','toca','cuanto'];
for(const g of games){
  let h=fs.readFileSync(path.join(root,g+'.html'),'utf8');
  h=h.replace('<html lang="es">','<html lang="es" data-tg-page="'+g+'">');
  h=h.replace(/(href|src)="(img\/|motor\.css|motor\.js|productos\.js)/g,'$1="../$2');
  if(!/viewport-fit=cover/.test(h))h=h.replace('user-scalable=no"','user-scalable=no,viewport-fit=cover"');
  h=h.replace('<link rel="stylesheet" href="../motor.css">','<link rel="stylesheet" href="../motor.css"><link rel="stylesheet" href="tg.css">'+SDK+'<script src="tg.js"></script>');
  /* las fotos de productos son rutas relativas (img/...): desde /tg/ van con ../ */
  h=h.replace('<script src="../productos.js"></script>','<script src="../productos.js"></script><script>(window.PRODUCTOS||[]).forEach(function(p){if(p&&p.i&&!/^(https?:|\\/|data:)/.test(p.i))p.i="../"+p.i})</script>');
  h=h.replace(/<title>([^<]*)<\/title>/,'<title>$1 · Telegram</title>');
  for(const need of ['telegram-web-app.js','tg.js','../motor.js','../productos.js'])
    if(!h.includes(need))throw new Error(g+': falta '+need);
  h=h.replace(/^<!doctype html>/i,'<!doctype html><!-- GENERADO por tools/build-tg.js a partir de ../'+g+'.html · no editar a mano -->');
  fs.writeFileSync(path.join(root,'tg',g+'.html'),h);
  console.log('tg/'+g+'.html');
}
