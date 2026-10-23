/* Small, dependency-free XLSX writer. Inventory values stay in the ledger. */
(()=>{
 'use strict';
 const encoder=new TextEncoder();
 const xml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
 const column=n=>{let out='';for(n++;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
 const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 function join(parts){const all=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let off=0;for(const p of parts){all.set(p,off);off+=p.length;}return all;}
 function zip(entries){
  const local=[],central=[];let offset=0;
  for(const [filename,text] of entries){
   const name=encoder.encode(filename),body=encoder.encode(text),crc=crc32(body);
   const head=new Uint8Array(30),h=new DataView(head.buffer);
   h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);
   h.setUint32(18,body.length,true);h.setUint32(22,body.length,true);h.setUint16(26,name.length,true);
   local.push(head,name,body);
   const dir=new Uint8Array(46),d=new DataView(dir.buffer);
   d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(14,33,true);
   d.setUint32(16,crc,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);
   d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.push(dir,name);
   offset+=head.length+name.length+body.length;
  }
  const directory=join(central),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);
  e.setUint32(12,directory.length,true);e.setUint32(16,offset,true);
  return join([...local,directory,end]);
 }
 function workbook(rows,at){
  const headers=['商品名称','分类','规格／包装','现有库存','库存单位','最近进货单价','进价单位','平均进价','库存成本金额','菜单售价／销售单位'];
  const values=[['有度茶舍 · 现有库存表'],['导出时间：'+String(at||new Date().toLocaleString('zh-CN'))+'；仅含已录入库存的商品'],headers,...rows];
  const sheetRows=values.map((row,r)=>'<row r="'+(r+1)+'">'+row.map((value,c)=>{
   const ref=column(c)+(r+1),style=r===0?1:r===2?2:typeof value==='number'?(c===3?4:3):0;
   if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+ref+'" s="'+style+'"><v>'+value+'</v></c>';
   return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="'+ns+'">'+
   '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
   '<cols>'+[27,12,29,14,12,19,14,18,19,42].map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>'+
   '<sheetData>'+sheetRows+'</sheetData><autoFilter ref="A3:J'+Math.max(3,values.length)+'"/>'+
   '<mergeCells count="2"><mergeCell ref="A1:J1"/><mergeCell ref="A2:J2"/></mergeCells></worksheet>';
  const styles='<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="'+ns+'">'+
   '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.00####"/><numFmt numFmtId="165" formatCode="0.###"/></numFmts>'+
   '<fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="16"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts>'+
   '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF365643"/><bgColor indexed="64"/></patternFill></fill></fills>'+
   '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
   '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
   '<cellXfs count="5"><xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf xfId="0" numFmtId="0" fontId="2" fillId="2" borderId="0"/><xf xfId="0" numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf xfId="0" numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs>'+
   '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return zip([
   ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
   ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="现有库存" sheetId="1" r:id="rId1"/></sheets></workbook>'],
   ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',sheet]
  ]);
 }
 function download(filename,bytes){
  const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(window.YouduNative&&typeof window.YouduNative.exportFileBase64==='function'){
   let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
   window.YouduNative.exportFileBase64(filename,btoa(raw),mime);return;
  }
  const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 window.YouduExcelV15={workbook,download};
})();
