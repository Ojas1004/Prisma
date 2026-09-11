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

    for href in ["#formats", "#how", "#use-cases"]:
        js(s,"window.scrollTo(0,0)"); time.sleep(0.8)
        js(s,f"document.querySelector('header a[href=\"{href}\"]').click()"); time.sleep(2.2)
        landed = js(s,"return Math.round(window.scrollY)")
        # scroll away and confirm it holds (no snapback)
        js(s,"window.scrollTo(0, 3400)"); time.sleep(0.15)
        imm = js(s,"return Math.round(window.scrollY)")
        time.sleep(1.2)
        held = js(s,"return Math.round(window.scrollY)")
        # and scroll up
        js(s,"window.scrollBy(0,-900)"); time.sleep(0.9)
        up = js(s,"return Math.round(window.scrollY)")
        print(f"{href:11s} landed={landed:5d}  ->3400 imm={imm:5d} after1.2s={held:5d}  scrollUp={up:5d}  {'OK' if held>3000 and up<held else 'STUCK'}")

    print("bottom reachable:", js(s,"window.scrollTo(0,999999); return Math.round(window.scrollY)+' / max '+(document.body.scrollHeight-window.innerHeight)"))
finally: ff.terminate()
