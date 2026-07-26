'use client';

import { HeaderBrand, FooterBrand } from '../../components/Brand';
import { Apple, MonitorDown, AlertTriangle, Terminal, ShieldAlert, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function InstallPage() {
  return (
    <div className="ch-page">
      <header className="ch-header">
        <HeaderBrand />
        <div className="ch-header-right">
          <a href="/" className="ch-btn ch-btn-inverse">
            <ArrowLeft size={16} strokeWidth={2} /> Back to Orbit
          </a>
        </div>
      </header>

      <section className="ch-shell" style={{ padding: '56px 32px 40px' }}>
        <div className="ch-kicker" style={{ marginBottom: 16 }}>
          Installing Compass
        </div>
        <h1 style={{ fontSize: 'var(--text-2xl)', maxWidth: 620, marginBottom: 14 }}>
          Getting Compass running on your computer
        </h1>
        <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-secondary)', maxWidth: 620, lineHeight: 'var(--leading-normal)' }}>
          Compass installers aren&apos;t signed with a paid developer certificate yet, so both macOS
          and Windows show a one-time warning before your first launch. This is normal — it happens
          because the app isn&apos;t registered with Apple or Microsoft, not because anything is wrong
          with the download. Follow the steps for your platform below; you&apos;ll only need to do this once.
        </p>

        <div className="ch-install-nav">
          <a href="#mac"><Apple size={16} strokeWidth={2} /> macOS instructions</a>
          <a href="#windows"><MonitorDown size={16} strokeWidth={2} /> Windows instructions</a>
        </div>
      </section>

      <section id="mac" className="ch-shell" style={{ padding: '20px 32px 64px' }}>
        <div className="ch-card pad-lg">
          <div className="ch-kicker" style={{ marginBottom: 10 }}>
            <Apple size={14} strokeWidth={2} /> macOS
          </div>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 6 }}>Installing on a Mac</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Works the same on Apple Silicon and Intel Macs — just grab the right download for your chip from the app card.
          </p>

          <div className="ch-step-list">
            <div className="ch-step">
              <div className="ch-step-num">1</div>
              <div className="ch-step-body">
                <h3>Download and open the .dmg</h3>
                <p>
                  Once the download finishes, open <code>Compass.dmg</code> from your Downloads
                  folder, then drag the <strong>Compass</strong> icon into the <strong>Applications</strong> folder
                  in the window that appears.
                </p>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">2</div>
              <div className="ch-step-body">
                <h3>First launch shows &quot;Compass is damaged&quot;</h3>
                <p>
                  Open Compass from Applications (or Launchpad). macOS will refuse to open it and
                  show a dialog saying it&apos;s damaged and should be moved to the Trash. This is
                  Gatekeeper reacting to an unsigned app — the file is fine, and you don&apos;t need to
                  delete it.
                </p>
                <div className="ch-step-visual">
                  <div className="ch-mock-caption">Illustrative — what you&apos;ll see</div>
                  <div className="ch-mock-dialog">
                    <div className="icon"><AlertTriangle size={22} strokeWidth={2} /></div>
                    <h4>&quot;Compass&quot; is damaged and can&apos;t be opened.</h4>
                    <p>You should move it to the Trash.</p>
                    <div className="buttons">
                      <button>Move to Trash</button>
                      <button className="primary">Cancel</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">3</div>
              <div className="ch-step-body">
                <h3>Click Cancel, then clear the quarantine flag in Terminal</h3>
                <p>
                  Click <strong>Cancel</strong> to keep the app. Open <strong>Terminal</strong> (Spotlight
                  search → &quot;Terminal&quot;) and run the command below. It removes the
                  &quot;downloaded from the internet&quot; flag macOS attaches to unsigned apps.
                </p>
                <div className="ch-step-visual">
                  <div className="ch-mock-caption">Illustrative — Terminal</div>
                  <div className="ch-mock-terminal">
                    <div className="bar"><span /><span /><span /></div>
                    <div className="body">
                      <span className="prompt">➜ ~ </span>
                      <span className="cmd">xattr -cr /Applications/Compass.app</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ch-copy-btn"
                    onClick={(e) => {
                      navigator.clipboard.writeText('xattr -cr /Applications/Compass.app');
                      const el = e.currentTarget;
                      const original = el.textContent;
                      el.textContent = 'Copied!';
                      setTimeout(() => { el.textContent = original; }, 1400);
                    }}
                  >
                    <Terminal size={13} strokeWidth={2} /> Copy command
                  </button>
                </div>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">4</div>
              <div className="ch-step-body">
                <h3>Open Compass again</h3>
                <p>
                  Launch Compass from Applications or Launchpad as normal. It will open without the
                  warning this time. You only need to run the Terminal command once, right after
                  installing — future launches (and future updates you drag into Applications) work normally.
                </p>
                <div className="ch-step-visual">
                  <span className="ch-badge success"><CheckCircle2 size={13} strokeWidth={2} /> Compass opens normally from here on</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="windows" className="ch-shell" style={{ padding: '20px 32px 96px' }}>
        <div className="ch-card pad-lg">
          <div className="ch-kicker" style={{ marginBottom: 10 }}>
            <MonitorDown size={14} strokeWidth={2} /> Windows
          </div>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 6 }}>Installing on Windows</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 8 }}>
            One extra click past Microsoft&apos;s SmartScreen warning, then a normal installer.
          </p>

          <div className="ch-step-list">
            <div className="ch-step">
              <div className="ch-step-num">1</div>
              <div className="ch-step-body">
                <h3>Download and run the .exe</h3>
                <p>
                  Open <code>Compass-win-x64.exe</code>{' '}from your Downloads folder (or click
                  &quot;Open file&quot; from the browser&apos;s download bar) to start the installer.
                </p>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">2</div>
              <div className="ch-step-body">
                <h3>&quot;Windows protected your PC&quot; appears</h3>
                <p>
                  This is Microsoft SmartScreen — it shows for any installer that isn&apos;t signed
                  with a paid Windows certificate yet. It&apos;s a warning, not a block.
                </p>
                <div className="ch-step-visual">
                  <div className="ch-mock-caption">Illustrative — what you&apos;ll see</div>
                  <div className="ch-mock-smartscreen">
                    <div className="titlebar">Windows protected your PC</div>
                    <div className="content">
                      <div className="icon"><ShieldAlert size={30} strokeWidth={1.75} /></div>
                      <div>
                        <h4>Microsoft Defender SmartScreen prevented an unrecognized app from starting.</h4>
                        <p>Running this app might put your PC at risk.</p>
                        <a className="link">More info</a>
                      </div>
                    </div>
                    <div className="buttons">
                      <button>Don&apos;t run</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">3</div>
              <div className="ch-step-body">
                <h3>Click &quot;More info&quot;, then &quot;Run anyway&quot;</h3>
                <p>
                  Clicking <strong>More info</strong> reveals the app name and publisher along with a
                  new <strong>Run anyway</strong> button. Click it to continue.
                </p>
                <div className="ch-step-visual">
                  <div className="ch-mock-caption">Illustrative — after clicking &quot;More info&quot;</div>
                  <div className="ch-mock-smartscreen">
                    <div className="titlebar">Windows protected your PC</div>
                    <div className="content">
                      <div className="icon"><ShieldAlert size={30} strokeWidth={1.75} /></div>
                      <div>
                        <h4>Microsoft Defender SmartScreen prevented an unrecognized app from starting.</h4>
                        <p>App: Compass-win-x64.exe<br />Publisher: Unknown publisher</p>
                      </div>
                    </div>
                    <div className="buttons">
                      <button>Don&apos;t run</button>
                      <button className="primary">Run anyway</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ch-step">
              <div className="ch-step-num">4</div>
              <div className="ch-step-body">
                <h3>Finish the install</h3>
                <p>
                  The Compass installer runs normally from here — follow the prompts, and it&apos;ll
                  add a shortcut to your Start menu. Future launches won&apos;t show SmartScreen again.
                </p>
                <div className="ch-step-visual">
                  <span className="ch-badge success"><CheckCircle2 size={13} strokeWidth={2} /> Compass opens normally from here on</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="ch-footer">
        <div className="ch-footer-bar" />
        <div className="ch-footer-inner">
          <FooterBrand />
          <span>www.1cloudhub.com</span>
          <span>© 2026 1CloudHub. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
