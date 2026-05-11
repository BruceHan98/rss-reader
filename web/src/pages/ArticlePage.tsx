import { useParams, useNavigate } from 'react-router-dom';
import ArticleReader from '../components/ArticleReader';

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <ArticleReader
      articleId={id}
      onBack={() => navigate(-1)}
    />
  );
}
