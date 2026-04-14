// ── CONFIG ────────────────────────────────────────────────────────
var CG='https://api.coingecko.com/api/v3';
var BN='https://api.binance.com/api/v3';
var BF='https://fapi.binance.com/fapi/v1';
var SHEET='1Wm-8Ouv78F7hutyQ3qgR4J7tsDLbMn3naB8JfKzvPfI';
var SCAN=['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','DOT','MATIC','LTC','UNI','ATOM','NEAR','APT','ARB','OP','SUI','TRX'];
// Binance symbol pairs for REST price fetch
var BN_PAIRS='["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","DOTUSDT","MATICUSDT","LTCUSDT","UNIUSDT","ATOMUSDT","NEARUSDT","APTUSDT","ARBUSDT","OPUSDT","SUIUSDT","TRXUSDT"]';

var cfg={cap:100,sl:-0.08,maxTrades:10,minScore:55,durSecs:600};
var startBal=100,curBal=100,peakBal=100;
var coins={},hists={},wsOn=false,restPollOn=false,fgVal=50,updateCnt=0;
var liveCoinsSet=new Set();
var simOn=false,simSecs=600,simTimer=null,simN=0;
var trades=[],wins=0,losses=0,buyCnt=0,sellCnt=0,totalFlips=0,totalInvested=0;
var settOpen=false,musicOn=false,mInt=null,actx=null;
var intelCache={},wsRetry=0;

// ── HELPERS ───────────────────────────────────────────────────────
function fmtPx(n){if(!n||isNaN(n))return'--';if(n>=10000)return Math.round(n).toLocaleString();if(n>=1000)return n.toFixed(2);if(n>=1)return n.toFixed(3);if(n>=.01)return n.toFixed(5);return n.toFixed(7);}
function f2(n){return(n===undefined||n===null)?'--':n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function nowS(){return new Date().toLocaleTimeString('en',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function fmtHeld(ms){var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);return(h?String(h).padStart(2,'0')+':':'')+String(m%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function symToId(sym){return{BTC:'bitcoin',ETH:'ethereum',SOL:'solana',BNB:'binancecoin',XRP:'ripple',DOGE:'dogecoin',ADA:'cardano',AVAX:'avalanche-2',LINK:'chainlink',DOT:'polkadot',MATIC:'matic-network',LTC:'litecoin',UNI:'uniswap',ATOM:'cosmos',NEAR:'near',APT:'aptos',ARB:'arbitrum',OP:'optimism',SUI:'sui',TRX:'tron'}[sym]||sym.toLowerCase();}

// ── CIPHER SCORE ─────────────────────────────────────────────────
function smartTP(sc,rsi,ch24){var t=[0.04,0.06,0.08,0.12,0.18,0.25];var i=sc>=88?5:sc>=78?4:sc>=68?3:sc>=58?2:sc>=48?1:0;if(rsi<28)i=Math.min(i+2,5);else if(rsi<38)i=Math.min(i+1,5);else if(rsi>68)i=Math.max(i-1,0);if(Math.abs(ch24)>18)i=Math.max(i-1,0);return t[i];}
function tpLbl(tp){return tp<=.04?'+4%':tp<=.06?'+6%':tp<=.08?'+8%':tp<=.12?'+12%':tp<=.18?'+18%':'+25% 🌙';}
function tpClr(tp){return tp<=.04?'var(--c)':tp<=.06?'#4af':tp<=.08?'var(--y)':tp<=.12?'#fa0':tp<=.18?'var(--g)':'#ff6fff';}
function cipherScore(sym){
  var c=coins[sym];if(!c)return{t:0,sig:'AVOID',hb:true};
  var intel=intelCache[sym]||{};
  var ch24=c.price_change_percentage_24h||0,ch7d=c.price_change_percentage_7d_in_currency||0;
  var vmr=c.total_volume/(c.market_cap||1),rank=c.market_cap_rank||999;
  var rsi15=intel.rsi15||Math.min(Math.max(50+ch24*2.2,0),100);
  var rsi1h=intel.rsi1h||Math.min(Math.max(50+ch24*1.8,0),100);
  var rsiA=rsi15*.5+rsi1h*.35+Math.min(Math.max(50+ch24*1.4,0),100)*.15;
  var rsiS=rsiA<25?95:rsiA<35?85:rsiA<45?72:rsiA<55?55:rsiA<65?40:rsiA<72?20:5;
  var cvd=intel.cvd||0,cvdS=Math.min(Math.max(cvd+50,0),100);
  var obR=intel.obRatio||1.0,obS=obR>2.2?92:obR>1.6?78:obR>1.2?62:obR>0.8?45:30;
  var fr=intel.funding||0,frS=fr<-.06?92:fr<-.02?74:fr<.01?56:fr<.03?42:fr<.06?26:14;
  var mS=Math.min(Math.max((ch24*.65+ch7d*.12)*2.5+50,0),100);
  var mS2=rank<=3?95:rank<=8?88:rank<=15?79:rank<=25?68:rank<=50?57:rank<=100?44:30;
  var oiS=ch24>3?76:ch24<-3?28:50;
  var t=rsiS*.22+cvdS*.18+obS*.15+frS*.12+mS*.14+mS2*.10+oiS*.09;
  if(rsi15<33&&cvd>12)t+=20;if(obR>2.2)t+=13;if(fr<-.06)t+=11;
  if(ch24>3&&ch24<12)t+=9;if(vmr>.32)t+=11;if(vmr>.60)t+=5;
  if(ch7d>18&&rsiA<64)t+=8;if(ch7d<-28&&rsiA<36)t+=9;
  if(rsiA>66)t-=18;if(rsiA>74)t-=30;if(fr>.07)t-=22;if(cvd<-22&&ch24>4)t-=22;
  t=Math.round(Math.max(0,Math.min(100,t)));
  var hb=rsi15>74||rsi1h>74||fr>.09||(cvd<-32&&ch24>5);
  var sig=hb?'AVOID':t>=cfg.minScore?'BUY':t>=(cfg.minScore-15)?'WATCH':'AVOID';
  return{t,rsi15:Math.round(rsi15),rsi1h:Math.round(rsi1h),rsiS:Math.round(rsiS),cvdS:Math.round(cvdS),obS:Math.round(obS),frS:Math.round(frS),mS:Math.round(mS),sig,hb,fr:(fr||0).toFixed(4),cvd,obRatio:(obR||1).toFixed(2),tp:smartTP(t,Math.round(rsi15),ch24)};
}

// ── PRICE UPDATE (from WS or REST) — called with REAL prices ──────
function applyPrice(sym,px){
  if(!px||isNaN(px)||px<=0)return;
  updateCnt++;
  liveCoinsSet.add(sym);
  // Update coin data
  if(!coins[sym])coins[sym]={current_price:px,price_change_percentage_24h:0,price_change_percentage_7d_in_currency:0,total_volume:0,market_cap:0,market_cap_rank:999,name:sym};
  var prev=coins[sym].current_price||px;
  coins[sym].current_price=px;
  coins[sym]._px=px;
  // Price history — real prices only
  if(!hists[sym])hists[sym]=[];
  hists[sym].push(px);
  if(hists[sym].length>500)hists[sym].shift();
  // Update header display
  if(sym==='BTC'){document.getElementById('btcPxLbl').textContent='$'+fmtPx(px);}
  document.getElementById('lastTick').textContent=nowS();
  if(updateCnt%10===0){
    document.getElementById('tickCount').textContent=updateCnt;
    document.getElementById('liveCount').textContent=liveCoinsSet.size+'/'+SCAN.length;
  }
  // Update open trades
  if(simOn){
    trades.forEach(function(tr,i){
      if(tr.status!=='running'||tr.sym!==sym)return;
      tr.curPx=px;tr.pnl=(px-tr.entry)/tr.entry*tr.alloc;
      chkExit(tr,i);
    });
  }
}

// ── WEBSOCKET — port 443 (better firewall penetration) ────────────
function connectWS(){
  setWS('var(--y)','CONNECTING WS...');
  try{
    // Try port 443 first — same as HTTPS, passes most firewalls
    var pairs=SCAN.map(function(s){return s.toLowerCase()+'usdt@aggTrade';}).join('/');
    var wsUrl='wss://stream.binance.com:443/stream?streams='+pairs;
    addLog('lc','Trying Binance WS port 443...');
    var ws=new WebSocket(wsUrl);
    var opened=false;
    var to=setTimeout(function(){
      if(!opened){
        ws.close();
        addLog('lw','WS port 443 timed out — trying port 9443...');
        connectWS9443();
      }
    },8000);
    ws.onopen=function(){
      opened=true;clearTimeout(to);wsOn=true;wsRetry=0;
      stopRestPoll();
      setWS('var(--g)','WS LIVE ✓ :443');
      document.getElementById('dataMode').textContent='BINANCE WS :443';
      document.getElementById('dataMode').style.color='var(--g)';
      addLog('lc','⚡ BINANCE WS CONNECTED (port 443) — real-time prices streaming');
    };
    ws.onmessage=function(e){
      try{
        var d=JSON.parse(e.data);
        if(!d||!d.data||!d.data.s)return;
        var sym=d.data.s.replace('USDT','');
        var px=parseFloat(d.data.p);
        applyPrice(sym,px);
      }catch(err){}
    };
    ws.onerror=function(){
      if(!opened){clearTimeout(to);addLog('lw','WS port 443 error');connectWS9443();}
    };
    ws.onclose=function(){
      if(opened){
        wsOn=false;
        setWS('var(--y)','WS CLOSED');
        addLog('lw','WS closed — switching to REST polling');
        startRestPoll();
        wsRetry++;
        setTimeout(connectWS,Math.min(wsRetry*10000,60000));
      }
    };
  }catch(e){
    addLog('lr','WS init error: '+e.message);
    connectWS9443();
  }
}
function connectWS9443(){
  try{
    var pairs=SCAN.map(function(s){return s.toLowerCase()+'usdt@aggTrade';}).join('/');
    var ws2=new WebSocket('wss://stream.binance.com:9443/stream?streams='+pairs);
    var op2=false;
    var to2=setTimeout(function(){
      if(!op2){ws2.close();addLog('lw','WS port 9443 timed out — using REST fallback');startRestPoll();}
    },8000);
    ws2.onopen=function(){
      op2=true;clearTimeout(to2);wsOn=true;wsRetry=0;
      stopRestPoll();
      setWS('var(--g)','WS LIVE ✓ :9443');
      document.getElementById('dataMode').textContent='BINANCE WS :9443';
      document.getElementById('dataMode').style.color='var(--g)';
      addLog('lc','⚡ BINANCE WS CONNECTED (port 9443) — real-time prices');
    };
    ws2.onmessage=function(e){
      try{var d=JSON.parse(e.data);if(!d||!d.data||!d.data.s)return;applyPrice(d.data.s.replace('USDT',''),parseFloat(d.data.p));}catch(err){}
    };
    ws2.onerror=function(){if(!op2){clearTimeout(to2);addLog('lw','WS port 9443 error — using REST fallback');startRestPoll();}};
    ws2.onclose=function(){
      if(op2){wsOn=false;setWS('var(--y)','WS CLOSED');startRestPoll();wsRetry++;setTimeout(connectWS,Math.min(wsRetry*10000,60000));}
    };
  }catch(e){addLog('lr','WS 9443 error: '+e.message);startRestPoll();}
}
function setWS(color,txt){var el=document.getElementById('wsChip');el.style.borderColor=color;el.style.color=color;document.getElementById('wsLbl').textContent=txt;}

// ── REST PRICE POLLING — REAL BINANCE PRICES every 3 seconds ─────
// This is the fallback when WS fails. It fetches REAL prices from
// Binance REST API — NOT simulated. No bias, no random walk.
var restPollInt=null;
function startRestPoll(){
  if(restPollOn)return;
  restPollOn=true;
  setWS('var(--c)','REST PRICES (REAL)');
  document.getElementById('dataMode').textContent='BINANCE REST (REAL)';
  document.getElementById('dataMode').style.color='var(--c)';
  addLog('lw','Using Binance REST price polling (real prices, updates every 3s)');
  fetchRestPrices();
  restPollInt=setInterval(fetchRestPrices,3000);
}
function stopRestPoll(){
  restPollOn=false;
  clearInterval(restPollInt);
}
function fetchRestPrices(){
  fetch(BN+'/ticker/price?symbols='+encodeURIComponent(BN_PAIRS))
    .then(function(r){return r.ok?r.json():null;})
    .then(function(data){
      if(!data||!Array.isArray(data))return;
      data.forEach(function(item){
        var sym=item.symbol.replace('USDT','');
        var px=parseFloat(item.price);
        if(SCAN.indexOf(sym)>=0)applyPrice(sym,px);
      });
      updateCoinChips();
    })
    .catch(function(e){addLog('lr','REST price fetch error: '+e.message);});
}

// ── COINGECKO — market meta (24h%, vol, mcap, rankings) ──────────
function fetchMarket(){
  var ids=SCAN.map(symToId).join(',');
  return Promise.all([
    fetch(CG+'/coins/markets?vs_currency=usd&ids='+ids+'&order=volume_desc&sparkline=false&price_change_percentage=24h,7d')
      .then(function(r){return r.ok?r.json():[];}).catch(function(){return[];}),
    fetch('https://api.alternative.me/fng/')
      .then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
  ]).then(function(rs){
    var data=rs[0],fg=rs[1];
    if(fg&&fg.data&&fg.data[0]){
      fgVal=parseInt(fg.data[0].value);
      var fc=document.getElementById('fgChip'),fc2=fgVal>=60?'var(--g)':fgVal>=40?'var(--y)':'var(--r)';
      fc.textContent='F&G:'+fgVal+(fgVal>=60?' 😀':fgVal>=40?' 😐':' 😱');
      fc.style.borderColor=fc2;fc.style.color=fc2;
    }
    var cgMap={bitcoin:'BTC',ethereum:'ETH',solana:'SOL',binancecoin:'BNB',ripple:'XRP',dogecoin:'DOGE',cardano:'ADA','avalanche-2':'AVAX',chainlink:'LINK',polkadot:'DOT','matic-network':'MATIC',litecoin:'LTC',uniswap:'UNI',cosmos:'ATOM',near:'NEAR',aptos:'APT',arbitrum:'ARB',optimism:'OP',sui:'SUI',tron:'TRX'};
    data.forEach(function(c){
      var sym=cgMap[c.id]||c.symbol.toUpperCase();
      if(!coins[sym])coins[sym]={};
      // Merge CoinGecko meta but keep Binance live price if we have it
      var livePx=coins[sym]._px||coins[sym].current_price;
      Object.assign(coins[sym],c,{_sym:sym});
      if(livePx&&livePx>0)coins[sym].current_price=livePx;
    });
    addLog('lc','CoinGecko meta loaded (24h%, rankings, vol) — Binance feeds live prices');
    updateCoinChips();
  }).catch(function(e){addLog('ld','CoinGecko: '+e.message);});
}

// ── INTEL (RSI/CVD/OB/FUNDING from Binance klines) ───────────────
function fetchK(sym,iv,lim){return fetch(BN+'/klines?symbol='+sym+'USDT&interval='+iv+'&limit='+(lim||30)).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;});}
function rsiCalc(c){var p=14;if(c.length<p+1)return 50;var g=0,l=0;for(var i=c.length-p;i<c.length;i++){var d=c[i]-c[i-1];if(d>0)g+=d;else l+=Math.abs(d);}var ag=g/p,al=l/p;if(al===0)return 100;return Math.round(100-100/(1+ag/al));}
function fetchIntel(sym){
  return Promise.all([
    fetchK(sym,'15m',30).then(function(k){return k?rsiCalc(k.map(function(x){return parseFloat(x[4]);})):50;}),
    fetchK(sym,'1h',30).then(function(k){return k?rsiCalc(k.map(function(x){return parseFloat(x[4]);})):50;}),
    fetchK(sym,'15m',20).then(function(k){if(!k)return 0;var bv=0,tv=0;k.forEach(function(c){bv+=parseFloat(c[9]);tv+=parseFloat(c[5]);});return Math.round(((tv>0?bv/tv:0.5)-.5)*200);}),
    fetch(BN+'/depth?symbol='+sym+'USDT&limit=20').then(function(r){if(!r.ok)return 1;return r.json().then(function(d){var bv=(d.bids||[]).reduce(function(s,b){return s+parseFloat(b[1]);},0),av=(d.asks||[]).reduce(function(s,a){return s+parseFloat(a[1]);},0);return av>0?bv/av:1;});}).catch(function(){return 1;}),
    fetch(BF+'/fundingRate?symbol='+sym+'USDT&limit=1').then(function(r){if(!r.ok)return 0;return r.json().then(function(d){return d[0]?parseFloat(d[0].fundingRate)*100:0;});}).catch(function(){return 0;})
  ]).then(function(rs){
    intelCache[sym]={rsi15:rs[0],rsi1h:rs[1],cvd:rs[2],obRatio:rs[3],funding:rs[4]};
    return intelCache[sym];
  }).catch(function(){
    intelCache[sym]={rsi15:50,rsi1h:50,cvd:0,obRatio:1,funding:0};
    return intelCache[sym];
  });
}
function deepScan(){
  addLog('lc','SCANNING RSI+CVD+OB+FUNDING...');
  var ps=SCAN.map(function(sym,i){return new Promise(function(resolve){setTimeout(function(){fetchIntel(sym).then(resolve).catch(resolve);},i*150);});});
  return Promise.all(ps).then(function(){addLog('lc','SCAN COMPLETE');updateCoinChips();});
}

// ── COIN CHIPS ────────────────────────────────────────────────────
function updateCoinChips(){
  var wrap=document.getElementById('coinChips');wrap.innerHTML='';
  SCAN.forEach(function(sym){
    var sc=cipherScore(sym);
    var div=document.createElement('div');
    div.className='cc '+(sc.sig==='BUY'?'buy':sc.sig==='WATCH'?'watch':'avoid');
    div.textContent=sym+(sc.t>0?' '+sc.t:'');
    wrap.appendChild(div);
  });
}

// ── BUILD TRADES ──────────────────────────────────────────────────
function buildTrades(){
  var scored=[];
  SCAN.forEach(function(sym){
    if(!coins[sym]||!coins[sym].current_price)return;
    var sc=cipherScore(sym);
    scored.push({sym,sc,coin:coins[sym]});
  });
  scored.sort(function(a,b){return b.sc.t-a.sc.t;});
  var buyList=scored.filter(function(x){return x.sc.sig==='BUY';}).slice(0,cfg.maxTrades);
  var watList=scored.filter(function(x){return x.sc.sig==='WATCH';}).slice(0,Math.max(0,cfg.maxTrades-buyList.length));
  var blkList=scored.filter(function(x){return x.sc.hb;}).slice(0,2);
  var toTrade=buyList.concat(watList);
  trades=[];totalInvested=0;
  toTrade.forEach(function(item){
    var px=item.coin._px||item.coin.current_price;
    if(!px||isNaN(px)||px<=0)return;
    totalInvested+=cfg.cap;
    trades.push({
      sym:item.sym,name:item.coin.name||item.sym,sc:item.sc,
      action:item.sc.sig,entry:px,curPx:px,pnl:0,status:'running',
      hist:[px],alloc:cfg.cap,tp:item.sc.tp,
      buyT:nowS(),buyMs:Date.now(),exitPx:null,exitT:null,exitMs:null
    });
  });
  blkList.slice(0,1).forEach(function(item){
    var px=item.coin._px||item.coin.current_price||0;
    trades.push({sym:item.sym,name:item.coin.name||item.sym,sc:item.sc,action:'BLOCKED',entry:px,curPx:px,pnl:0,status:'blocked',hist:[],alloc:cfg.cap,tp:0,buyT:null,buyMs:Date.now(),exitPx:null,exitT:null,exitMs:null});
  });
  buyCnt=trades.filter(function(t){return t.action!=='BLOCKED';}).length;
  document.getElementById('mrIn').textContent='$'+f2(totalInvested);
  updAll();renderAllCards();
  trades.forEach(function(tr){
    if(tr.action!=='BLOCKED')addLog('lg','BUY '+tr.sym+' @ $'+fmtPx(tr.entry)+' | CIPHER:'+tr.sc.t+' | $'+f2(tr.alloc)+' IN | TP:+'+Math.round(tr.tp*100)+'%');
    else addLog('ld','BLOCKED: '+tr.sym+' rsi:'+tr.sc.rsi15+' fr:'+tr.sc.fr);
  });
}

// ── EXIT LOGIC ────────────────────────────────────────────────────
function chkExit(tr,i){
  if(tr.status!=='running')return;
  var pct=(tr.curPx-tr.entry)/tr.entry;
  if(pct<=cfg.sl)closeTrade(tr,i,'stopped');
  else if(pct>=tr.tp)closeTrade(tr,i,'tp');
}
function closeTrade(tr,i,reason){
  tr.status=reason;tr.exitPx=tr.curPx;tr.exitT=nowS();tr.exitMs=Date.now();
  var profit=tr.pnl,pct=(tr.curPx-tr.entry)/tr.entry*100;
  sellCnt++;
  if(reason==='tp'){wins++;totalFlips++;playWin();flash('🎯 TP +'+Math.round(tr.tp*100)+'%  +$'+profit.toFixed(2),'sfg');spawnP('win');addLog('lg','🎯 TP '+tr.sym+' +'+pct.toFixed(2)+'% | PROFIT +$'+profit.toFixed(2));}
  else if(reason==='stopped'){losses++;playLose();flash('🛑 SL '+tr.sym+' '+pct.toFixed(2)+'%','sfr');spawnP('lose');addLog('lr','🛑 SL '+tr.sym+' '+pct.toFixed(2)+'% | -$'+Math.abs(profit).toFixed(2));}
  else{if(profit>=0)wins++;else losses++;addLog('lw','✋ CLOSED '+tr.sym+' '+(profit>=0?'+':'')+profit.toFixed(2));}
  updAll();renderCard(i);
  document.getElementById('cFlip').textContent=totalFlips;
  document.getElementById('mrF').textContent=totalFlips;
}
function manualClose(i){var tr=trades[i];if(!tr||tr.status!=='running')return;closeTrade(tr,i,'manual');}

// ── RENDER ────────────────────────────────────────────────────────
function renderAllCards(){
  var area=document.getElementById('cards');area.innerHTML='';
  trades.forEach(function(_,i){var d=document.createElement('div');d.id='tc'+i;area.appendChild(d);renderCard(i);});
}
function renderCard(i){
  var tr=trades[i],el=document.getElementById('tc'+i);if(!el||!tr)return;
  var isB=tr.action==='BLOCKED';
  var pct=tr.entry?(tr.curPx-tr.entry)/tr.entry:0,pctPc=pct*100;
  var up=pct>=0,pnlD=isB?0:tr.pnl,pnlC=isB?'var(--t2)':pnlD>=0?'var(--g)':'var(--r)';
  var tpC=tpClr(tr.tp),isRun=tr.status==='running',isClosed=!isRun&&!isB;
  var cardC=isB?'tblk':tr.status==='tp'?'ttp':(tr.status==='stopped'||tr.status==='manual')?'tsl':pnlD>0?'twin':tr.action==='BUY'?'tbuy':'twat';
  var bdgT=isB?'BLOCKED':tr.status==='tp'?('🎯+'+Math.round(tr.tp*100)+'%'):tr.status==='stopped'?'🛑 SL':tr.status==='manual'?'✋':tr.action==='BUY'?'LONG':'WATCH';
  var bdgC=isB?'bd':tr.status==='tp'?'by':(tr.status==='stopped'||tr.status==='manual')?'br':tr.action==='BUY'?'bg':'by';
  var sc=tr.sc,heldMs=isRun?(Date.now()-tr.buyMs):(tr.exitMs&&tr.buyMs?(tr.exitMs-tr.buyMs):0);
  var topHTML='';
  if(isClosed){
    var isWin=tr.status==='tp'||(tr.status==='manual'&&pnlD>=0);
    var rClass=isWin?'win':tr.status==='stopped'?'loss':'manual';
    var rSign=pnlD>=0?'+':'-',rColor=isWin?'var(--g)':tr.status==='stopped'?'var(--r)':'var(--y)';
    topHTML='<div class="tresult '+rClass+'">'
      +'<div class="tr-label '+rClass+'">'+(tr.status==='tp'?'✓ TAKE PROFIT':tr.status==='stopped'?'✗ STOP LOSS':'✋ CLOSED')+'</div>'
      +'<div class="tr-amount" style="color:'+rColor+'">'+rSign+'$'+Math.abs(pnlD).toFixed(2)+'</div>'
      +'<div class="tr-pct" style="color:'+rColor+'">('+rSign+Math.abs(pctPc).toFixed(2)+'%)</div>'
      +'<div class="tr-detail">'
      +'<div class="tr-d"><div class="tr-dl">INVESTED</div><div class="tr-dv">$'+f2(tr.alloc)+'</div></div>'
      +'<div class="tr-d"><div class="tr-dl">ENTRY</div><div class="tr-dv">$'+fmtPx(tr.entry)+'</div></div>'
      +'<div class="tr-d"><div class="tr-dl">EXIT</div><div class="tr-dv" style="color:'+rColor+'">$'+fmtPx(tr.exitPx||tr.curPx)+'</div></div>'
      +'<div class="tr-d"><div class="tr-dl">HELD</div><div class="tr-dv">'+fmtHeld(heldMs)+'</div></div>'
      +'</div></div>';
  } else if(!isB){
    var valNow='$'+f2(tr.alloc+pnlD);
    topHTML='<div class="tinv">'
      +'<div><div class="tinv-lbl">INVESTED</div><div class="tinv-val">$'+f2(tr.alloc)+'</div></div>'
      +'<div style="text-align:center"><div class="tinv-lbl">VALUE NOW</div><div class="tinv-val" style="color:'+(up?'var(--g)':'var(--r)')+'">'+valNow+'</div></div>'
      +'<div style="text-align:right"><div class="tinv-lbl">P&L</div><div class="tinv-pnl" style="color:'+pnlC+'">'+(pnlD>=0?'+':'-')+'$'+Math.abs(pnlD).toFixed(2)+'</div></div>'
      +'</div>';
    var pc2=pct>0.001?'up':pct<-0.001?'dn':'flat',pnc=pct>0.001?'tpct-up':pct<-0.001?'tpct-dn':'tpct-flat';
    topHTML+='<div class="tpct-row '+pc2+'">'
      +'<div><div class="tpct-num '+pnc+'">'+(pct>=0?'+':'')+pctPc.toFixed(2)+'%</div></div>'
      +'<div class="tpct-right"><span class="tpct-held">HELD: '+fmtHeld(heldMs)+'</span>'
      +'<div class="tpct-pnl-dollar" style="color:'+pnlC+'">'+(pnlD>=0?'+':'')+pnlD.toFixed(2)+'</div></div>'
      +'</div>';
  }
  el.innerHTML='<div class="tc '+cardC+'">'
    +topHTML
    +'<div class="tch"><div class="tcl"><div class="tsym">'+tr.sym+'</div><div class="tnm">'+tr.name+'</div></div><div class="bdg '+bdgC+'">'+bdgT+'</div></div>'
    +'<div class="tpg">'
    +'<div class="tpi"><div class="tpil">ENTRY</div><div class="tpiv">$'+fmtPx(tr.entry)+'</div></div>'
    +'<div class="tpi"><div class="tpil">LIVE</div><div class="tpiv" style="color:'+(isB?'var(--t2)':up?'var(--g)':'var(--r)')+'">$'+fmtPx(tr.curPx)+'</div></div>'
    +'<div class="tpi"><div class="tpil">CIPHER</div><div class="tpiv" style="color:'+(sc.t>=68?'var(--g)':sc.t>=45?'var(--y)':'var(--r)')+'">'+sc.t+'</div></div>'
    +'<div class="tpi"><div class="tpil">TARGET</div><div class="tpiv" style="color:'+tpC+'">+'+Math.round(tr.tp*100)+'%</div></div>'
    +'</div>'
    +'<div class="tprow"><span style="font-size:10px;color:var(--t2)">TP:</span>'
    +'<span class="ttag" style="color:'+tpC+';border-color:'+tpC+'">'+tpLbl(tr.tp)+'</span>'
    +'<span class="ttag" style="color:var(--r);border-color:var(--r)">SL -'+Math.round(Math.abs(cfg.sl)*100)+'%</span>'
    +'</div>'
    +'<div class="sbrs">'
    +'<div class="sb"><div class="sbl">RSI</div><div class="sbv" style="color:'+(sc.rsiS>=60?'var(--g)':sc.rsiS>=40?'var(--y)':'var(--r)')+'">'+sc.rsi15+'</div><div class="sbt"><div class="sbf" style="width:'+sc.rsiS+'%;background:'+(sc.rsiS>=60?'var(--g)':sc.rsiS>=40?'var(--y)':'var(--r)')+'"></div></div></div>'
    +'<div class="sb"><div class="sbl">CVD</div><div class="sbv" style="color:'+(sc.cvdS>=60?'var(--g)':sc.cvdS>=40?'var(--y)':'var(--r)')+'">'+(sc.cvd>0?'+':'')+sc.cvd+'</div><div class="sbt"><div class="sbf" style="width:'+sc.cvdS+'%;background:var(--c)"></div></div></div>'
    +'<div class="sb"><div class="sbl">OB</div><div class="sbv" style="color:'+(sc.obS>=60?'var(--g)':sc.obS>=40?'var(--y)':'var(--r)')+'">'+sc.obRatio+'x</div><div class="sbt"><div class="sbf" style="width:'+sc.obS+'%;background:var(--y)"></div></div></div>'
    +'<div class="sb"><div class="sbl">FUND</div><div class="sbv" style="color:'+(sc.frS>=60?'var(--g)':sc.frS>=40?'var(--y)':'var(--r)')+'">'+sc.fr+'</div><div class="sbt"><div class="sbf" style="width:'+sc.frS+'%;background:#bf5af2"></div></div></div>'
    +'<div class="sb"><div class="sbl">MOM</div><div class="sbv" style="color:'+(sc.mS>=60?'var(--g)':sc.mS>=40?'var(--y)':'var(--r)')+'">'+(coins[tr.sym]&&coins[tr.sym].price_change_percentage_24h||0).toFixed(1)+'%</div><div class="sbt"><div class="sbf" style="width:'+sc.mS+'%;background:var(--g)"></div></div></div>'
    +'</div>'
    +'<div class="mch"><canvas id="cc'+i+'" width="500" height="40"></canvas></div>'
    +(isRun&&!isB?'<button class="cbtn" onclick="manualClose('+i+')">✋ CLOSE $'+f2(tr.alloc)+' NOW</button>':'')
    +'</div>';
  setTimeout(function(){drawSpark(i);},0);
}
function drawSpark(i){
  var tr=trades[i],cv=document.getElementById('cc'+i);if(!cv||!tr)return;
  var ctx=cv.getContext('2d'),W=cv.width,H=cv.height;ctx.clearRect(0,0,W,H);
  var hist=tr.hist.length>1?tr.hist:[tr.entry,tr.curPx];if(hist.length<2)return;
  var mn=hist[0],mx=hist[0];
  for(var k=1;k<hist.length;k++){if(hist[k]<mn)mn=hist[k];if(hist[k]>mx)mx=hist[k];}
  var rng=mx-mn||mn*.004||.001;
  var pct=tr.entry?(tr.curPx-tr.entry)/tr.entry:0;
  var lc=tr.action==='BLOCKED'?'rgba(74,106,128,.4)':pct>=0?'#00ff9d':'#ff2d55';
  var step=Math.max(1,Math.floor(hist.length/W));
  ctx.beginPath();ctx.strokeStyle=lc;ctx.lineWidth=1.5;ctx.shadowColor=lc;ctx.shadowBlur=3;
  var f=true;
  for(var j=0;j<hist.length;j+=step){var x=(j/(hist.length-1||1))*W,y=H-((hist[j]-mn)/rng*(H-4))-2;if(f){ctx.moveTo(x,y);f=false;}else ctx.lineTo(x,y);}
  ctx.stroke();ctx.shadowBlur=0;
  ctx.beginPath();ctx.moveTo(0,H);
  for(var j2=0;j2<hist.length;j2+=step)ctx.lineTo((j2/(hist.length-1||1))*W,H-((hist[j2]-mn)/rng*(H-4))-2);
  ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=lc+'18';ctx.fill();
  var ey=H-((tr.entry-mn)/rng*(H-4))-2;
  ctx.beginPath();ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.moveTo(0,ey);ctx.lineTo(W,ey);ctx.stroke();ctx.setLineDash([]);
  if(tr.tp&&!isNaN(tr.tp)){var tpy=H-((tr.entry*(1+tr.tp)-mn)/rng*(H-4))-2;if(tpy>0&&tpy<H){ctx.beginPath();ctx.strokeStyle=tpClr(tr.tp)+'55';ctx.lineWidth=1;ctx.setLineDash([2,4]);ctx.moveTo(0,tpy);ctx.lineTo(W,tpy);ctx.stroke();ctx.setLineDash([]);}}
}

// ── STATS & DISPLAY ───────────────────────────────────────────────
function updCdown(s){
  var m=Math.floor(s/60),sec=s%60;
  document.getElementById('ctm').textContent=String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
  var p=document.getElementById('cpr');p.style.strokeDashoffset=163*(1-s/cfg.durSecs);p.style.stroke=s>cfg.durSecs*.5?'var(--g)':s>cfg.durSecs*.2?'var(--y)':'var(--r)';
  var st=document.getElementById('cstat');st.textContent=simOn?'RUNNING ▶':s===cfg.durSecs?'READY':'DONE';st.style.color=simOn?'var(--g)':s===cfg.durSecs?'var(--y)':'var(--c)';
}
function updAll(){
  var livePnl=trades.filter(function(t){return t.action!=='BLOCKED';}).reduce(function(s,t){return s+t.pnl;},0);
  curBal=startBal+livePnl;
  var pEl=document.getElementById('sPnl');pEl.textContent=(livePnl>=0?'+':'')+f2(Math.abs(livePnl));pEl.style.color=livePnl>=0?'var(--g)':'var(--r)';
  var bEl=document.getElementById('sBal');bEl.textContent='$'+f2(curBal);bEl.style.color=curBal>=startBal?'var(--g)':'var(--r)';
  document.getElementById('sW').textContent=' '+wins;document.getElementById('sL').textContent=' '+losses;
  document.getElementById('cBuy').textContent=buyCnt;document.getElementById('cSell').textContent=sellCnt;
  document.getElementById('cOpen').textContent=trades.filter(function(t){return t.status==='running';}).length;
  refreshMoney(curBal,startBal);
}
function refreshMoney(cur,start){
  var diff=cur-start,pct=start>0?(diff/start*100):0;
  var el=document.getElementById('mbig'),ch=document.getElementById('mchg');
  el.textContent='$'+f2(cur);
  if(diff>0.005){el.className='mbig mu';ch.textContent='+$'+f2(diff)+' (+'+pct.toFixed(2)+'%)';ch.style.color='var(--g)';}
  else if(diff<-0.005){el.className='mbig md';ch.textContent='-$'+f2(Math.abs(diff))+' ('+pct.toFixed(2)+'%)';ch.style.color='var(--r)';}
  else{el.className='mbig mn';ch.textContent='+$0.00 (0.00%)';ch.style.color='var(--t2)';}
  if(cur>peakBal){peakBal=cur;document.getElementById('mrP').textContent='$'+f2(peakBal);}
}
function spawnP(type){
  var c=document.getElementById('parts'),em=type==='win'?['💰','⚡','🟢','✨']:['❌','📉','🔴'];
  for(var i=0;i<6;i++){var p=document.createElement('div');p.className='pp';p.textContent=em[Math.floor(Math.random()*em.length)];p.style.left=Math.random()*100+'%';p.style.top='50%';p.style.animationDelay=(Math.random()*.5)+'s';c.appendChild(p);(function(el){setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},2000);})(p);}
}

// ── SIM CONTROLS ──────────────────────────────────────────────────
function startSim(){
  if(simOn)return;initAudio();
  var btn=document.getElementById('startBtn');btn.setAttribute('disabled','');btn.textContent='SCANNING...';
  wins=0;losses=0;buyCnt=0;sellCnt=0;totalFlips=0;totalInvested=0;
  var v=parseFloat(document.getElementById('amtInp').value)||100;
  cfg.cap=v;startBal=v;curBal=v;peakBal=v;
  document.getElementById('mrS').textContent='$'+f2(v);document.getElementById('btmCap').textContent='$'+f2(v);
  addLog('lc','STARTING $'+f2(v)+' — fetching live prices...');
  document.querySelectorAll('.cc').forEach(function(el){el.className='cc scanning';el.textContent=el.textContent.split(' ')[0];});
  // Fetch market meta + intel then build trades
  fetchMarket().then(function(){
    return deepScan();
  }).then(function(){
    // Make sure we have real prices before building trades
    if(liveCoinsSet.size<5){
      addLog('lw','Waiting for live prices...');
      return new Promise(function(resolve){setTimeout(resolve,3000);});
    }
  }).then(function(){
    buildTrades();
    if(trades.filter(function(t){return t.action!=='BLOCKED';}).length===0){
      addLog('lr','No trades built — not enough live price data yet. Try again in 5s.');
      btn.removeAttribute('disabled');btn.textContent='▶ START SIM';simOn=false;return;
    }
    simOn=true;simSecs=cfg.durSecs;simN++;
    flash('▶ '+trades.filter(function(t){return t.action!=='BLOCKED';}).length+' POSITIONS OPENED!','sfg');
    addLog('lc','SIM RUNNING — '+trades.filter(function(t){return t.action!=='BLOCKED';}).length+' trades | $'+f2(totalInvested)+' deployed');
    btn.removeAttribute('disabled');btn.textContent='RUNNING...';
    simTimer=setInterval(function(){
      simSecs--;updCdown(simSecs);updAll();
      if(simSecs===Math.floor(cfg.durSecs*.5))addLog('lw','HALFWAY POINT');
      if(simSecs===60)addLog('lw','1 MIN REMAINING');
      if(simSecs<=0)endSim();
    },1000);
  }).catch(function(err){
    addLog('lr','START ERROR: '+err.message);
    btn.removeAttribute('disabled');btn.textContent='▶ START SIM';
  });
}
function resetSim(){
  clearInterval(simTimer);simOn=false;simSecs=cfg.durSecs;trades=[];
  wins=0;losses=0;buyCnt=0;sellCnt=0;totalFlips=0;totalInvested=0;
  updCdown(cfg.durSecs);
  document.getElementById('cards').innerHTML='<div class="emp"><div class="ei">⚡</div><div class="et">WATCH "LAST UPDATE"<br>TICKING = REAL DATA<br><br>SET AMOUNT + START</div></div>';
  var btn=document.getElementById('startBtn');btn.removeAttribute('disabled');btn.textContent='▶ START SIM';
  var v=parseFloat(document.getElementById('amtInp').value)||100;startBal=v;curBal=v;peakBal=v;
  refreshMoney(v,v);
  document.getElementById('sBal').textContent='$'+f2(v);document.getElementById('sPnl').textContent='$0.00';
  document.getElementById('sW').textContent=' 0';document.getElementById('sL').textContent=' 0';
  document.getElementById('cBuy').textContent='0';document.getElementById('cSell').textContent='0';
  document.getElementById('cOpen').textContent='0';document.getElementById('cFlip').textContent='0';
  document.getElementById('mrIn').textContent='$0';document.getElementById('mrF').textContent='0';
  closeRes();
}
function endSim(){
  clearInterval(simTimer);simOn=false;
  trades.forEach(function(t){if(t.status==='running'){t.status='closed';t.exitPx=t.curPx;t.exitMs=Date.now();}});
  var btn=document.getElementById('startBtn');btn.removeAttribute('disabled');btn.textContent='▶ START SIM';
  playWin();flash('★ SIM COMPLETE!','sfy');addLog('lc','DONE');renderAllCards();showRes();
}
function showRes(){
  var live=trades.filter(function(t){return t.action!=='BLOCKED';});
  var blk=trades.filter(function(t){return t.action==='BLOCKED';});
  var total=live.reduce(function(s,t){return s+t.pnl;},0);
  var wc=live.filter(function(t){return t.pnl>0;}).length,wr=live.length?Math.round(wc/live.length*100):0;
  document.getElementById('rsm').innerHTML=
    '<div class="rs"><div class="rsl">STARTED</div><div class="rsv">$'+f2(startBal)+'</div></div>'
    +'<div class="rs"><div class="rsl">ENDED</div><div class="rsv" style="color:'+(total>=0?'var(--g)':'var(--r)')+'">$'+f2(startBal+total)+'</div></div>'
    +'<div class="rs"><div class="rsl">TOTAL P&L</div><div class="rsv" style="color:'+(total>=0?'var(--g)':'var(--r)')+'">'+(total>=0?'+':'')+'$'+total.toFixed(2)+'</div></div>'
    +'<div class="rs"><div class="rsl">WIN RATE</div><div class="rsv" style="color:'+(wr>=50?'var(--g)':'var(--r)')+'">'+wr+'% ('+wc+'/'+live.length+')</div></div>';
  document.getElementById('rtrd').innerHTML=live.sort(function(a,b){return b.pnl-a.pnl;}).concat(blk).map(function(t){
    var isB=t.action==='BLOCKED',pct=t.entry?(t.curPx-t.entry)/t.entry*100:0,s=t.pnl>=0?'+':'-';
    var out=isB?'🚫 SAVED':t.status==='tp'?('🎯+'+Math.round(t.tp*100)+'%'):t.status==='stopped'?'🛑 SL':t.pnl>=0?'✅ WIN':'📉 LOSS';
    var rc=isB?'rsk':t.pnl>=0?'rw':'rl';
    return '<div class="rt '+rc+'"><div class="rrow"><div><div class="rl2">COIN</div><div class="rv">'+t.sym+'</div></div><div><div class="rl2">INVESTED</div><div class="rv">$'+f2(t.alloc)+'</div></div><div><div class="rl2">RESULT</div><div class="rv">'+out+'</div></div></div>'
      +'<div class="rrow"><div><div class="rl2">ENTRY</div><div class="rv">$'+fmtPx(t.entry)+'</div></div><div><div class="rl2">EXIT</div><div class="rv">$'+fmtPx(t.exitPx||t.curPx)+'</div></div>'
      +'<div><div class="rl2">P&L</div><div class="rv" style="color:'+(isB?'var(--dim)':t.pnl>=0?'var(--g)':'var(--r)')+'">'+(isB?'SAVED':s+'$'+Math.abs(t.pnl).toFixed(2)+' ('+s+Math.abs(pct).toFixed(2)+'%)')+'</div></div></div></div>';
  }).join('');
  document.getElementById('rnot').textContent=total>=0
    ?'▲ PROFIT $'+f2(startBal)+' → $'+f2(startBal+total)+' | +'+((total/startBal)*100).toFixed(2)+'% | DATA: '+(wsOn?'Binance WS':'Binance REST') +' | '+blk.length+' trap(s) avoided'
    :'▼ LOSS $'+f2(startBal)+' → $'+f2(startBal+total)+' | DATA: '+(wsOn?'Binance WS':'Binance REST');
  document.getElementById('rov').classList.add('on');
}
function closeRes(){document.getElementById('rov').classList.remove('on');}

// ── SETTINGS ──────────────────────────────────────────────────────
function onAmt(v){var val=parseFloat(v)||100;cfg.cap=val;startBal=val;curBal=val;peakBal=val;document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('on');});refreshMoney(val,val);document.getElementById('sBal').textContent='$'+f2(val);document.getElementById('mrS').textContent='$'+f2(val);document.getElementById('btmCap').textContent='$'+f2(val);}
function setAmt(val,btn){cfg.cap=val;startBal=val;curBal=val;peakBal=val;document.getElementById('amtInp').value=val;document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');refreshMoney(val,val);document.getElementById('sBal').textContent='$'+f2(val);document.getElementById('mrS').textContent='$'+f2(val);document.getElementById('btmCap').textContent='$'+f2(val);}
function setSl(v){cfg.sl=-v/100;document.getElementById('slV').textContent='-'+v+'%';document.getElementById('slD').textContent=' -'+v+'%';document.getElementById('btmSL').textContent='-'+v+'%';}
function setMinScore(v){cfg.minScore=parseInt(v);document.getElementById('minScoreV').textContent=v+'/100';updateCoinChips();}
function setDur(v){cfg.durSecs=parseInt(v)*60;document.getElementById('durV').textContent=v+' min';simSecs=cfg.durSecs;updCdown(cfg.durSecs);}
function toggleSett(){settOpen=!settOpen;document.getElementById('sbar').classList.toggle('hid',!settOpen);document.getElementById('stxt').textContent=settOpen?'COLLAPSE':'EXPAND';}
function flash(txt,cls){var el=document.getElementById('sf');el.textContent=txt;el.className='sf '+cls;el.style.display='block';setTimeout(function(){el.style.display='none';},1600);}
function addLog(cls,msg){var el=document.getElementById('logEl');var d=document.createElement('div');d.className='li '+cls;d.textContent=nowS()+' '+msg;el.insertBefore(d,el.firstChild);while(el.children.length>50)el.removeChild(el.lastChild);}

// ── MUSIC — fixed for iOS ─────────────────────────────────────────
var NN={C3:130.81,G3:196,A3:220,C4:261.63,E4:329.63,G4:392,A4:440,B4:493.88,C5:523.25,E5:659.25,G5:783.99,'_':0};
var MEL=['E5','E5','_','E5','_','C5','E5','_','G5','_','_','G4','_','C5','_','_','G4','_','_','E4','_','A4','_','B4','_','A4','G4','E5','G5','_','E5','_','C5'];
var BAS=['C3','_','G3','_','C3','_','G3','_','A3','_','E4','_'];
var msi=0,bsi=0;
function initAudio(){if(!actx){try{actx=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}}
function nt(f,t,v,d){
  if(!actx||!musicOn||!f)return;
  if(actx.state==='suspended'){actx.resume().then(function(){nt(f,t,v,d);});return;}
  try{var o=actx.createOscillator(),g=actx.createGain();o.connect(g);g.connect(actx.destination);o.type=t||'square';o.frequency.value=f;g.gain.setValueAtTime(v||.22,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+(d||.13));o.start();o.stop(actx.currentTime+(d||.13));}catch(e){}
}
function toggleMusic(){
  initAudio();musicOn=!musicOn;
  var btn=document.getElementById('musicBtn');
  if(musicOn){
    if(actx){
      actx.resume().then(function(){
        mInt=setInterval(function(){
          var m=MEL[msi%MEL.length];if(m&&NN[m])nt(NN[m],'square',.22,.13);
          var b=BAS[bsi%BAS.length];if(b&&NN[b])nt(NN[b],'triangle',.28,.14);
          msi++;bsi++;
        },145);
      });
    }
    if(btn){btn.textContent='♪ ON';btn.style.color='var(--g)';btn.style.borderColor='var(--g)';}
  }else{
    clearInterval(mInt);msi=0;bsi=0;
    if(btn){btn.textContent='♪';btn.style.color='var(--y)';btn.style.borderColor='var(--y)';}
  }
}
function playWin(){
  initAudio();if(!actx)return;
  var r=actx.state==='suspended'?actx.resume():Promise.resolve();
  r.then(function(){[261,329,392,523,659,784].forEach(function(f,i){setTimeout(function(){try{var o=actx.createOscillator(),g=actx.createGain();o.connect(g);g.connect(actx.destination);o.type='square';o.frequency.value=f;g.gain.setValueAtTime(.28,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+.15);o.start();o.stop(actx.currentTime+.15);}catch(e){}},i*70);});});
}
function playLose(){
  initAudio();if(!actx)return;
  var r=actx.state==='suspended'?actx.resume():Promise.resolve();
  r.then(function(){[392,329,261,220].forEach(function(f,i){setTimeout(function(){try{var o=actx.createOscillator(),g=actx.createGain();o.connect(g);g.connect(actx.destination);o.type='sawtooth';o.frequency.value=f;g.gain.setValueAtTime(.25,actx.currentTime);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+.12);o.start();o.stop(actx.currentTime+.12);}catch(e){}},i*60);});});
}

// ── CARD UPDATE LOOP ──────────────────────────────────────────────
var cardLoopInt=null,lastDraw=0;
function startCardLoop(){
  if(cardLoopInt)clearInterval(cardLoopInt);
  cardLoopInt=setInterval(function(){
    if(simOn){
      var now=Date.now();
      if(now-lastDraw>700){
        trades.forEach(function(_,i){if(trades[i]&&trades[i].status==='running')renderCard(i);});
        lastDraw=now;updAll();updateCoinChips();
      }
    }
  },700);
}

// Refresh CoinGecko meta every 2 minutes
setInterval(function(){if(!simOn)fetchMarket();},120000);

// ── BOOT ──────────────────────────────────────────────────────────
addLog('lc','⚡ CIPHER v5 — REAL BINANCE PRICES ONLY');
addLog('lc','WS: tries port 443 then 9443. Fallback = real Binance REST prices every 3s');
addLog('lw','NO fake simulation — prices are always real from Binance');
addLog('lc','Scanning: '+SCAN.join(' '));

(function(){
  var wrap=document.getElementById('coinChips');
  SCAN.forEach(function(sym){var d=document.createElement('div');d.className='cc scanning';d.textContent=sym;wrap.appendChild(d);});
})();

// Start WebSocket and REST poll simultaneously — REST will stop if WS connects
connectWS();
startRestPoll(); // Start REST immediately as baseline, WS will override it
fetchMarket().then(function(){
  updateCoinChips();
  addLog('lg','▶ Ready — press ▶ START SIM');
}).catch(function(){addLog('ld','CoinGecko pending');});

startCardLoop();
updCdown(cfg.durSecs);