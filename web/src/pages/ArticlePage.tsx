import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import ArticleReader from '../components/ArticleReader';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setImmersiveMode, markArticleRead } = useStore();

  useEffect(() => () => { setImmersiveMode(false); }, []);

  if (!id) return null;

  return (
    <ArticleReader
      articleId={id}
      onBack={() => navigate(-1)}
      onRead={(articleId, feedId) => markArticleRead(articleId, true, feedId).catch(() => {})}
    />
  );
}
