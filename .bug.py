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

    print("baseline scrollY:", js(s,"return Math.round(window.scrollY)"))
    print("page height:", js(s,"return document.body.scrollHeight"))

    # click the Formats nav link
    js(s,"document.querySelector('header a[href=\"#formats\"]').click()")
    time.sleep(2.5)
    print("after click scrollY:", js(s,"return Math.round(window.scrollY)"))

    # try to scroll further
    js(s,"window.scrollBy(0, 600)")
    time.sleep(1.2)
    print("after scrollBy+600:", js(s,"return Math.round(window.scrollY)"))
    js(s,"window.scrollTo(0, 3000)")
    time.sleep(1.2)
    print("after scrollTo 3000:", js(s,"return Math.round(window.scrollY)"))

    print("--- diagnostics ---")
    print(js(s,"""return JSON.stringify({
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      htmlHeight: getComputedStyle(document.documentElement).height,
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
      scrollHeight: document.body.scrollHeight,
      innerHeight: window.innerHeight,
      maxScroll: document.body.scrollHeight - window.innerHeight,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
    });"""))
finally: ff.terminate()
