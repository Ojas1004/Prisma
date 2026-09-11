import socket, json, time, subprocess
ff=subprocess.Popen(["firefox","--headless","--no-remote","--profile","/tmp/ff-prisma-profile",
                     "--window-size=1440,900","--marionette","http://localhost:5173/"],
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(16)
def recv(s):
    b=b""
    while b":" not in b: b+=s.recv(1)
    n=int(b.split(b":")[0]); d=b.split(b":",1)[1]
    while len(d)<n: d+=s.recv(n-len(d))
    return json.loads(d)
def send(s,m,p):
    j=json.dumps([0,1,m,p]); s.sendall(f"{len(j)}:{j}".encode()); return recv(s)
def js(s,script): return send(s,"WebDriver:ExecuteScript",{"script":script,"args":[]})[3].get("value")
try:
    s=socket.create_connection(("127.0.0.1",2828),timeout=25); recv(s); send(s,"WebDriver:NewSession",{})
    time.sleep(3); send(s,"WebDriver:SetWindowRect",{"width":1440,"height":900}); time.sleep(2)

    # A) Does scroll work WITHOUT clicking the nav link?
    js(s,"window.scrollTo(0,3000)"); time.sleep(1.2)
    print("A) scrollTo(3000) with NO click:", js(s,"return Math.round(window.scrollY)"))
    js(s,"window.scrollTo(0,0)"); time.sleep(1)

    # B) Now click and retest
    js(s,"document.querySelector('header a[href=\"#formats\"]').click()"); time.sleep(2.5)
    print("B) after click:", js(s,"return Math.round(window.scrollY)"))
    js(s,"window.scrollTo(0,3000)"); time.sleep(1.2)
    print("B) scrollTo(3000) after click:", js(s,"return Math.round(window.scrollY)"))

    # C) What is the hash / is the browser re-anchoring?
    print("C) location.hash:", js(s,"return location.hash"))
    print("C) #formats offsetTop:", js(s,"const e=document.querySelector('#formats'); return e?Math.round(e.getBoundingClientRect().top+window.scrollY):null"))
    print("C) scroll-mt on #formats:", js(s,"const e=document.querySelector('#formats'); return e?getComputedStyle(e).scrollMarginTop:null"))

    # D) Clear the hash and retry
    js(s,"history.replaceState(null,'',location.pathname); window.scrollTo(0,3000)"); time.sleep(1.2)
    print("D) after clearing hash, scrollTo(3000):", js(s,"return Math.round(window.scrollY)"))
finally: ff.terminate()
