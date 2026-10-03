import Logo from './Logo.jsx'
import Footer from './Footer.jsx'

const UPDATED = '3 October 2026'

const PAGES = {
  privacy: {
    title: 'Privacy',
    sections: [
      [
        'Summary',
        'Sentinel Crowd is a prototype that runs entirely in your web browser. Video is never uploaded to a server. No faces are recognised. No data is stored by us.',
      ],
      [
        'Video and camera',
        'When you upload a video or turn on a webcam in Live Detection mode, the frames are processed on your own device by a person detection model running in the browser. The video file and the camera stream are not sent anywhere. Closing the tab ends processing.',
      ],
      [
        'What the model does',
        'The model draws a box around each person it finds and the app counts how many boxes fall in each zone. It does not identify people, read faces, estimate age or gender, or track individuals across frames.',
      ],
      [
        'What is stored',
        'The app does not store video, images, counts or alerts. Alerts exist only in the open page and are cleared when you reload it. To make Live Detection faster on later visits, your browser keeps a copy of the public AI model files in its local storage (IndexedDB). This copy contains no personal data, and clearing your browser data removes it.',
      ],
      [
        'Network requests',
        'The page loads fonts from Google Fonts and, the first time Live Detection is opened, the public COCO-SSD model files from Google Cloud Storage. These requests do not include any video or results. The hosting provider may keep standard access logs such as IP address and time of request.',
      ],
      ['No tracking', 'There are no analytics, advertising scripts, cookies for tracking, or user accounts.'],
      ['Contact', 'Questions about this prototype can be raised through the project repository on GitHub.'],
    ],
  },
  terms: {
    title: 'Terms of use',
    sections: [
      [
        'Prototype only',
        'Sentinel Crowd is a hackathon prototype for demonstration and research. It is not a certified safety system and must not be relied on as the only means of protecting people at any event or location.',
      ],
      [
        'No guarantee of accuracy',
        'Person detection uses a general model that can miss people, especially in dense crowds, poor light or unusual camera angles. Counts, risk levels and alerts may be wrong or late. Decisions about crowd safety remain the responsibility of trained staff and the authorities in charge.',
      ],
      [
        'Your footage',
        'Only use video you have the right to use. If you point the app at a live camera, follow the laws and policies that apply to recording and monitoring people where you are.',
      ],
      [
        'Simulation data',
        'Simulation mode shows a scripted, fictional scenario. Station names, gates and numbers in it do not describe a real place or event.',
      ],
      [
        'Liability',
        'The software is provided as is, without warranty of any kind. The authors are not liable for any loss or harm arising from its use.',
      ],
      ['Changes', 'These terms may change as the project develops. The date below shows the latest version.'],
    ],
  },
}

export default function LegalPage({ page }) {
  const p = PAGES[page]
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b-[3px] border-line-strong bg-panel">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center gap-2.5 px-6">
          <a href="#" className="flex items-center gap-2.5 text-fg hover:text-black">
            <Logo />
            <span className="font-bold">Sentinel Crowd</span>
          </a>
          <a href="#dashboard" className="link ml-auto text-sm">
            Open dashboard
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <p className="mt-1 text-sm text-dim">Last updated {UPDATED}</p>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {p.sections.map(([h, body]) => (
            <section key={h} className="grid gap-1 py-4 sm:grid-cols-[200px_1fr] sm:gap-6">
              <h2 className="text-sm font-bold text-fg">{h}</h2>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <Footer />
      </div>
    </div>
  )
}
