import { useModal, openModal } from '../store/modal';
import { DateModal, ExtraModal, PeopleModal, LetterModal, LinkModal, ToPlanModal, Takeover } from './modals';
import { useSpeltak } from '../store/speltak';
import { useNavigate } from 'react-router-dom';

export default function ModalHost() {
  const { modal, close } = useModal();
  const { sid } = useSpeltak();
  const nav = useNavigate();
  if (!modal) return null;
  const takeover = (oid: string, fresh: boolean) => openModal({ kind: 'takeover', oid, fresh });
  switch (modal.kind) {
    case 'date': return <DateModal keyId={modal.keyId} onClose={close} />;
    case 'extra': return <ExtraModal onClose={close} onCreated={e => nav(`/s/${sid}/jaarplanning?focus=${e.id}`)} />;
    case 'people': return <PeopleModal keyId={modal.keyId} field={modal.field} onClose={close} />;
    case 'letter': return <LetterModal keyId={modal.keyId} onClose={close} />;
    case 'link': return <LinkModal keyId={modal.keyId} onClose={close} onTakeover={takeover} />;
    case 'toplan': return <ToPlanModal oid={modal.oid} onClose={close} onTakeover={takeover} />;
    case 'takeover': return <Takeover oid={modal.oid} fresh={modal.fresh} onClose={close} />;
  }
}
