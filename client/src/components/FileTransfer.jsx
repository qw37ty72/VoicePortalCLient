import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { initFileTransfer, uploadChunk } from '../api';
import styles from './FileTransfer.module.css';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_FILE_SIZE = 200 * 1024 * 1024 * 1024; // 200 GB

export default function FileTransfer({ receiverId, channelId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!receiverId) {
      setError('Выберите диалог с другом для отправки файла');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Файл больше 150 ГБ');
      return;
    }
    setError('');
    setUploading(true);
    setProgress(0);
    try {
      const { transferId } = await initFileTransfer(receiverId, file.name, file.size, file.type);
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);
        await uploadChunk(transferId, i, totalChunks, blob);
        setProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (channelId) return null;

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="file"
        className={styles.hidden}
        onChange={handleFile}
        disabled={uploading}
      />
      <button
        type="button"
        className={styles.attachBtn}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Отправить файл (до 200 ГБ)"
      >
        <Paperclip size={20} />
      </button>
      {uploading && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          <span className={styles.progressText}>{progress}%</span>
        </div>
      )}
      {error && (
        <span className={styles.error} onClick={() => setError('')}>
          {error} <X size={14} />
        </span>
      )}
    </div>
  );
}
