import { Component, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useModal, openModal } from '../store/modal';
import { DateModal, ExtraModal, PeopleModal, LetterModal, LinkModal, ToPlanModal, Takeover, NameModal } from './modals';
import { useSpeltak } from '../store/speltak';
import { toast } from '../store/toast';

/**
 * Een fout in een venster: alleen dat venster dicht, met een melding. De pagina en het menu blijven staan
 * (het venster valt buiten de foutopvang van de pagina). Per geopend venster een nieuwe opvang (`key`).
 */
class ModalBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('Venster kon niet worden getoond:', error); this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function ModalHost() {
  const { modal, seq, close } = useModal();
  const { sid, peekEntry } = useSpeltak();
  const nav = useNavigate();
  // naar een andere pagina (ook met de terugknop van de telefoon of de browser): het venster gaat dicht
  const { pathname } = useLocation();
  useEffect(() => { close(); }, [pathname, close]);
  if (!modal) return null;
  // de rij is elders weggehaald (ander apparaat) terwijl het venster openstond: niets tonen in plaats van een venster zonder rij
  if ('keyId' in modal && !modal.keyId.startsWith('s:') && !peekEntry(modal.keyId)) return null;
  const takeover = (oid: string, fresh: boolean) => openModal({ kind: 'takeover', oid, fresh });
  const failed = () => { close(); toast('Dit venster kon niet worden getoond. Probeer het opnieuw.'); };
  let body: ReactNode = null;
  switch (modal.kind) {
    case 'date': body = <DateModal keyId={modal.keyId} onClose={close} />; break;
    case 'extra': body = <ExtraModal onClose={close} onCreated={e => nav(`/s/${sid}/jaarplanning?focus=${e.id}`)} />; break;
    case 'people': body = <PeopleModal keyId={modal.keyId} field={modal.field} onClose={close} />; break;
    case 'letter': body = <LetterModal keyId={modal.keyId} onClose={close} />; break;
    case 'link': body = <LinkModal keyId={modal.keyId} q0={modal.q} back={modal.back} onClose={close} onTakeover={takeover} />; break;
    case 'toplan': body = <ToPlanModal oid={modal.oid} onClose={close} onTakeover={takeover} />; break;
    case 'name': body = <NameModal spec={modal} onClose={close} />; break;
    case 'takeover': body = <Takeover oid={modal.oid} fresh={modal.fresh} onClose={close} />; break;
  }
  return <ModalBoundary key={seq} onError={failed}>{body}</ModalBoundary>;
}
